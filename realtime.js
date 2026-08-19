import WebSocket, { WebSocketServer } from "ws";
import { getBusinessForCall, releaseBusinessForCall } from "./businessResolver.js";
import { buildRealtimeInstructions } from "./conversationPrompt.js";
import { realtimeTools, runRealtimeTool } from "./realtimeTools.js";

const MAX_QUEUED_AUDIO_FRAMES = 250;
const HEARTBEAT_MS = 20000;
const OPENAI_SESSION_TIMEOUT_MS = 10000;
const CALLER_SILENCE_MS = 30000;
const LANGUAGE_LOCK = "LANGUAGE LOCK: Speak ONLY in natural British English. Never switch language because of accent, noise, mis-transcription, a foreign-sounding name, or a previous model output. If speech is unclear, ask for clarification in British English.";
const TURN_RULE = "TURN RULE: One caller turn gets one assistant turn. Answer fully, but do not ramble. Ask AT MOST ONE question. After asking one question, STOP and wait for the caller.";

function safeSend(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  try { socket.send(JSON.stringify(payload)); return true; } catch (error) { console.error("WebSocket send failed:", error.message || error); return false; }
}
function parseJson(raw) { try { return JSON.parse(raw.toString()); } catch { return null; } }
function parseArguments(raw) { try { const parsed = JSON.parse(raw || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }

function createSessionConfig(businessConfig, createResponse = false) {
  return {
    type: "realtime",
    instructions: `${LANGUAGE_LOCK}\n${TURN_RULE}\n\n${buildRealtimeInstructions(businessConfig)}`,
    output_modalities: ["audio"], tools: realtimeTools, tool_choice: "auto", max_output_tokens: "inf",
    truncation: { type: "retention_ratio", retention_ratio: 0.8 },
    audio: {
      input: {
        format: { type: "audio/pcmu" }, noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-4o-mini-transcribe", language: "en", prompt: `Transcribe only as English. This is a British English business phone call for ${businessConfig.businessName}. Expect English names, dates, times and customer questions.` },
        turn_detection: { type: "semantic_vad", eagerness: "high", create_response: createResponse, interrupt_response: createResponse }
      },
      output: { format: { type: "audio/pcmu" }, voice: process.env.OPENAI_REALTIME_VOICE || "marin", speed: 1.0 }
    }
  };
}

export function attachRealtimeBridge(server) {
  const wss = new WebSocketServer({ server, path: "/media-stream", perMessageDeflate: false, maxPayload: 2 * 1024 * 1024 });
  wss.on("connection", twilioSocket => {
    if (!process.env.OPENAI_API_KEY) { twilioSocket.close(1011, "Service not configured"); return; }
    let streamSid = null, sessionConfigured = false, greetingStarted = false, greetingCompleted = false, activatingConversation = false, conversationReady = false, responseActive = false, closed = false, pendingHangupMark = null, pendingSilenceMark = null, silenceTimer = null, silencePromptSent = false;
    let businessConfig = null;
    const queuedAudio = [], processedToolCalls = new Set();
    const context = { callerNumber: "", callSid: "", savedBookings: new Map(), endCallRequested: false, businessConfig: null };
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
    const openaiSocket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    const clearSilenceTimer = () => { if (silenceTimer) clearTimeout(silenceTimer); silenceTimer = null; };
    const armSilenceTimer = () => { clearSilenceTimer(); if (!conversationReady || context.endCallRequested || silencePromptSent) return; silenceTimer = setTimeout(() => { silenceTimer = null; if (!conversationReady || responseActive || context.endCallRequested || silencePromptSent || openaiSocket.readyState !== WebSocket.OPEN) return; silencePromptSent = true; safeSend(openaiSocket, { type: "response.create", response: { instructions: `${LANGUAGE_LOCK} Say only a brief natural check such as "Hello, are you still there?" Then STOP and listen.` } }); }, CALLER_SILENCE_MS); };
    const sessionTimeout = setTimeout(() => { if (!sessionConfigured && openaiSocket.readyState <= WebSocket.OPEN) openaiSocket.close(1011, "Session setup timeout"); }, OPENAI_SESSION_TIMEOUT_MS);
    const configureSession = createResponse => { if (!businessConfig || openaiSocket.readyState !== WebSocket.OPEN) return; safeSend(openaiSocket, { type: "session.update", session: createSessionConfig(businessConfig, createResponse) }); };
    const maybeStartGreeting = () => { if (!sessionConfigured || !streamSid || greetingStarted || !businessConfig) return; queuedAudio.length = 0; greetingStarted = true; safeSend(openaiSocket, { type: "response.create", response: { instructions: `${LANGUAGE_LOCK} Say exactly this greeting and nothing before it: "${businessConfig.greeting}" Then STOP and listen.` } }); };
    const flushQueuedAudio = () => { if (!conversationReady || openaiSocket.readyState !== WebSocket.OPEN) return; while (queuedAudio.length) safeSend(openaiSocket, { type: "input_audio_buffer.append", audio: queuedAudio.shift() }); };
    const enableConversation = () => { if (activatingConversation || conversationReady || openaiSocket.readyState !== WebSocket.OPEN) return; activatingConversation = true; configureSession(true); };

    openaiSocket.on("open", () => { if (businessConfig) configureSession(false); });
    twilioSocket.on("message", raw => {
      const msg = parseJson(raw); if (!msg) return;
      if (msg.event === "start") {
        streamSid = msg.start?.streamSid || msg.streamSid || null; const params = msg.start?.customParameters || {};
        context.callerNumber = String(params.callerNumber || "").trim(); context.callSid = String(params.callSid || msg.start?.callSid || "").trim();
        businessConfig = getBusinessForCall(context.callSid); context.businessConfig = businessConfig;
        if (openaiSocket.readyState === WebSocket.OPEN && !sessionConfigured) configureSession(false);
        maybeStartGreeting(); return;
      }
      if (msg.event === "mark") { const name = String(msg.mark?.name || ""); if (pendingHangupMark && name === pendingHangupMark) { pendingHangupMark = null; setTimeout(() => { if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close(1000, "Call completed"); }, 100); return; } if (pendingSilenceMark && name === pendingSilenceMark) { pendingSilenceMark = null; armSilenceTimer(); } return; }
      if (msg.event === "media" && msg.media?.payload) { if (context.endCallRequested) return; if (!conversationReady || openaiSocket.readyState !== WebSocket.OPEN) { queuedAudio.push(msg.media.payload); if (queuedAudio.length > MAX_QUEUED_AUDIO_FRAMES) queuedAudio.shift(); } else safeSend(openaiSocket, { type: "input_audio_buffer.append", audio: msg.media.payload }); return; }
      if (msg.event === "stop" && openaiSocket.readyState <= WebSocket.OPEN) openaiSocket.close(1000, "Twilio stream stopped");
    });
    openaiSocket.on("message", async raw => {
      const event = parseJson(raw); if (!event) return;
      if (event.type === "session.updated") { if (!sessionConfigured) { sessionConfigured = true; clearTimeout(sessionTimeout); maybeStartGreeting(); return; } if (activatingConversation) { activatingConversation = false; conversationReady = true; flushQueuedAudio(); } return; }
      if (event.type === "response.created") { responseActive = true; clearSilenceTimer(); pendingSilenceMark = null; return; }
      if (event.type === "input_audio_buffer.speech_started") { clearSilenceTimer(); pendingSilenceMark = null; silencePromptSent = false; if (responseActive && streamSid) safeSend(twilioSocket, { event: "clear", streamSid }); return; }
      if (event.type === "response.output_audio.delta" && event.delta && streamSid) { safeSend(twilioSocket, { event: "media", streamSid, media: { payload: event.delta } }); return; }
      if (event.type === "response.output_audio.done" && streamSid) { if (greetingStarted && !greetingCompleted) { greetingCompleted = true; enableConversation(); } const markName = context.endCallRequested ? `hangup-${event.response_id || Date.now()}` : `assistant-${event.response_id || Date.now()}`; if (context.endCallRequested) pendingHangupMark = markName; else if (!silencePromptSent) pendingSilenceMark = markName; safeSend(twilioSocket, { event: "mark", streamSid, mark: { name: markName } }); return; }
      if (event.type === "response.function_call_arguments.done") { const callId = String(event.call_id || ""); if (!callId || processedToolCalls.has(callId)) return; processedToolCalls.add(callId); const args = parseArguments(event.arguments); let result; try { result = await runRealtimeTool(event.name, args, context); } catch (error) { console.error(`Realtime tool ${event.name} failed:`, error.message || error); result = { ok: false, reason: "tool_error" }; } if (result?.action === "end_call") { context.endCallRequested = true; clearSilenceTimer(); pendingSilenceMark = null; } safeSend(openaiSocket, { type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }); safeSend(openaiSocket, { type: "response.create", response: { instructions: context.endCallRequested ? `${LANGUAGE_LOCK} Say one short friendly goodbye only. Do not ask anything else.` : `${LANGUAGE_LOCK} ${TURN_RULE} Continue from the tool result. Give the direct answer first. Ask at most ONE question, then STOP and wait.` } }); return; }
      if (event.type === "response.done") { responseActive = false; return; }
      if (event.type === "error") { console.error("OpenAI Realtime error:", event.error || event); responseActive = false; }
    });
    const heartbeat = setInterval(() => { if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.ping(); if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.ping(); }, HEARTBEAT_MS);
    const cleanup = () => { if (closed) return; closed = true; clearTimeout(sessionTimeout); clearSilenceTimer(); clearInterval(heartbeat); queuedAudio.length = 0; context.savedBookings.clear(); releaseBusinessForCall(context.callSid); };
    twilioSocket.on("error", error => { console.error("Twilio websocket error:", error.message || error); cleanup(); if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close(); });
    twilioSocket.on("close", () => { cleanup(); if (openaiSocket.readyState <= WebSocket.OPEN) openaiSocket.close(); });
    openaiSocket.on("error", error => { console.error("OpenAI websocket error:", error.message || error); cleanup(); if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close(1011, "AI connection failed"); });
    openaiSocket.on("close", () => { cleanup(); if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close(); });
  });
  wss.on("error", error => console.error("Media stream server error:", error.message || error));
}
