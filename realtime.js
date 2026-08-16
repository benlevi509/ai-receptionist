import WebSocket, { WebSocketServer } from "ws";
import businessConfig from "./businessConfig.js";
import { buildRealtimeInstructions } from "./conversationPrompt.js";
import { realtimeTools, runRealtimeTool } from "./realtimeTools.js";

const MAX_QUEUED_AUDIO_FRAMES = 250;
const HEARTBEAT_MS = 20000;
const OPENAI_SESSION_TIMEOUT_MS = 10000;
const LANGUAGE_LOCK = "LANGUAGE LOCK: Speak ONLY in natural British English. Never answer in Italian, German, French, Spanish or any other language. Never switch language because of accent, noise, mis-transcription, a foreign-sounding name, or a previous model output. If speech is unclear, ask for clarification in British English. This rule overrides any inferred language.";

function safeSend(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("WebSocket send failed:", error.message || error);
    return false;
  }
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function parseArguments(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createSessionConfig(createResponse = true) {
  return {
    type: "realtime",
    instructions: `${LANGUAGE_LOCK}\n\n${buildRealtimeInstructions()}`,
    output_modalities: ["audio"],
    tools: realtimeTools,
    tool_choice: "auto",
    max_output_tokens: 1200,
    truncation: { type: "retention_ratio", retention_ratio: 0.8 },
    audio: {
      input: {
        format: { type: "audio/pcmu" },
        noise_reduction: { type: "near_field" },
        transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "en",
          prompt: `Transcribe ONLY as English. This is a British English restaurant phone call for ${businessConfig.businessName}. Expect English names, dates, times, menu questions and table bookings. Do not infer another language from accent, noise or unclear audio.`
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "medium",
          create_response: createResponse,
          interrupt_response: false
        }
      },
      output: {
        format: { type: "audio/pcmu" },
        voice: process.env.OPENAI_REALTIME_VOICE || "marin",
        speed: 1.0
      }
    }
  };
}

export function attachRealtimeBridge(server) {
  const wss = new WebSocketServer({
    server,
    path: "/media-stream",
    perMessageDeflate: false,
    maxPayload: 2 * 1024 * 1024
  });

  wss.on("connection", twilioSocket => {
    if (!process.env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY environment variable.");
      twilioSocket.close(1011, "Service not configured");
      return;
    }

    let streamSid = null;
    let sessionConfigured = false;
    let greetingStarted = false;
    let greetingCompleted = false;
    let activatingConversation = false;
    let conversationReady = false;
    let closed = false;
    let pendingHangupMark = null;

    const queuedAudio = [];
    const processedToolCalls = new Set();
    const context = {
      callerNumber: "",
      callSid: "",
      savedBookings: new Map(),
      endCallRequested: false
    };

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
    const openaiSocket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    const sessionTimeout = setTimeout(() => {
      if (!sessionConfigured) {
        console.error(`OpenAI Realtime session timed out: call=${context.callSid || "unknown"}`);
        if (openaiSocket.readyState === WebSocket.OPEN || openaiSocket.readyState === WebSocket.CONNECTING) {
          openaiSocket.close(1011, "Session setup timeout");
        }
      }
    }, OPENAI_SESSION_TIMEOUT_MS);

    const maybeStartGreeting = () => {
      if (!sessionConfigured || !streamSid || greetingStarted) return;
      queuedAudio.length = 0;
      greetingStarted = true;

      safeSend(openaiSocket, {
        type: "response.create",
        response: {
          instructions: `${LANGUAGE_LOCK} Give exactly one warm, brief phone greeting in British English. Preserve the meaning of: ${businessConfig.greeting}. Do not give a second greeting. Then stop and listen.`
        }
      });
    };

    const flushQueuedAudio = () => {
      if (!conversationReady || openaiSocket.readyState !== WebSocket.OPEN) return;
      while (queuedAudio.length) {
        safeSend(openaiSocket, {
          type: "input_audio_buffer.append",
          audio: queuedAudio.shift()
        });
      }
    };

    const enableConversation = () => {
      if (activatingConversation || conversationReady || openaiSocket.readyState !== WebSocket.OPEN) return;
      activatingConversation = true;
      safeSend(openaiSocket, {
        type: "session.update",
        session: createSessionConfig(true)
      });
    };

    openaiSocket.on("open", () => {
      safeSend(openaiSocket, {
        type: "session.update",
        session: createSessionConfig(false)
      });
    });

    twilioSocket.on("message", raw => {
      const msg = parseJson(raw);
      if (!msg) return;

      if (msg.event === "start") {
        streamSid = msg.start?.streamSid || msg.streamSid || null;
        const params = msg.start?.customParameters || {};
        context.callerNumber = String(params.callerNumber || "").trim();
        context.callSid = String(params.callSid || msg.start?.callSid || "").trim();
        console.log(`Media stream started: call=${context.callSid || "unknown"} stream=${streamSid || "unknown"}`);
        maybeStartGreeting();
        return;
      }

      if (msg.event === "mark") {
        const name = String(msg.mark?.name || "");
        if (pendingHangupMark && name === pendingHangupMark) {
          pendingHangupMark = null;
          setTimeout(() => {
            if (twilioSocket.readyState === WebSocket.OPEN) {
              twilioSocket.close(1000, "Call completed");
            }
          }, 100);
        }
        return;
      }

      if (msg.event === "media" && msg.media?.payload) {
        if (context.endCallRequested) return;

        if (!conversationReady || openaiSocket.readyState !== WebSocket.OPEN) {
          queuedAudio.push(msg.media.payload);
          if (queuedAudio.length > MAX_QUEUED_AUDIO_FRAMES) queuedAudio.shift();
        } else {
          safeSend(openaiSocket, {
            type: "input_audio_buffer.append",
            audio: msg.media.payload
          });
        }
        return;
      }

      if (msg.event === "stop") {
        console.log(`Media stream stopped: call=${context.callSid || "unknown"} stream=${streamSid || "unknown"}`);
        if (openaiSocket.readyState === WebSocket.OPEN || openaiSocket.readyState === WebSocket.CONNECTING) {
          openaiSocket.close(1000, "Twilio stream stopped");
        }
      }
    });

    openaiSocket.on("message", async raw => {
      const event = parseJson(raw);
      if (!event) return;

      if (event.type === "session.updated") {
        if (!sessionConfigured) {
          sessionConfigured = true;
          clearTimeout(sessionTimeout);
          maybeStartGreeting();
          return;
        }

        if (activatingConversation) {
          activatingConversation = false;
          conversationReady = true;
          flushQueuedAudio();
        }
        return;
      }

      if (event.type === "response.output_audio.delta" && event.delta && streamSid) {
        safeSend(twilioSocket, {
          event: "media",
          streamSid,
          media: { payload: event.delta }
        });
        return;
      }

      if (event.type === "response.output_audio.done" && streamSid) {
        if (greetingStarted && !greetingCompleted) {
          greetingCompleted = true;
          enableConversation();
        }

        const markName = context.endCallRequested
          ? `hangup-${event.response_id || Date.now()}`
          : `assistant-${event.response_id || Date.now()}`;

        if (context.endCallRequested) pendingHangupMark = markName;

        safeSend(twilioSocket, {
          event: "mark",
          streamSid,
          mark: { name: markName }
        });
        return;
      }

      if (event.type === "response.function_call_arguments.done") {
        const callId = String(event.call_id || "");
        if (!callId || processedToolCalls.has(callId)) return;
        processedToolCalls.add(callId);

        const args = parseArguments(event.arguments);
        let result;

        try {
          result = await runRealtimeTool(event.name, args, context);
        } catch (error) {
          console.error(`Realtime tool ${event.name} failed:`, error.message || error);
          result = { ok: false, reason: "tool_error" };
        }

        if (result?.action === "end_call") {
          context.endCallRequested = true;
        }

        safeSend(openaiSocket, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(result)
          }
        });

        safeSend(openaiSocket, {
          type: "response.create",
          response: {
            instructions: context.endCallRequested
              ? `${LANGUAGE_LOCK} Say one short friendly goodbye in British English only. Do not ask anything else.`
              : `${LANGUAGE_LOCK} Continue naturally in British English only from the tool result. Give the direct answer first. Do not greet the caller again. Do not repeat questions whose answers are already known.`
          }
        });
        return;
      }

      if (event.type === "response.done" && event.response?.status && event.response.status !== "completed") {
        console.warn(
          `Realtime response ended with status=${event.response.status} call=${context.callSid || "unknown"}`,
          event.response.status_details || ""
        );
        return;
      }

      if (event.type === "error") {
        console.error("OpenAI Realtime error:", event.error || event);
      }
    });

    const heartbeat = setInterval(() => {
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.ping();
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.ping();
    }, HEARTBEAT_MS);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearTimeout(sessionTimeout);
      clearInterval(heartbeat);
      queuedAudio.length = 0;
      context.savedBookings.clear();
    };

    twilioSocket.on("error", error => {
      console.error("Twilio websocket error:", error.message || error);
      cleanup();
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    });

    twilioSocket.on("close", (code, reason) => {
      console.log(`Twilio websocket closed: code=${code} reason=${reason?.toString() || "none"}`);
      cleanup();
      if (openaiSocket.readyState === WebSocket.OPEN || openaiSocket.readyState === WebSocket.CONNECTING) {
        openaiSocket.close();
      }
    });

    openaiSocket.on("error", error => {
      console.error("OpenAI websocket error:", error.message || error);
      cleanup();
      if (twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.close(1011, "AI connection failed");
      }
    });

    openaiSocket.on("close", (code, reason) => {
      console.log(`OpenAI websocket closed: code=${code} reason=${reason?.toString() || "none"}`);
      cleanup();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    });
  });

  wss.on("error", error => {
    console.error("Media stream server error:", error.message || error);
  });
}
