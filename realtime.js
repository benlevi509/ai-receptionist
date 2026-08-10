import WebSocket, { WebSocketServer } from "ws";
import businessConfig from "./businessConfig.js";
import { buildRealtimeInstructions } from "./conversationPrompt.js";
import { realtimeTools, runRealtimeTool } from "./realtimeTools.js";

const MAX_QUEUED_AUDIO_FRAMES = 250;
const HEARTBEAT_MS = 20000;

function safeSend(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
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

function createSessionConfig() {
  return {
    type: "realtime",
    instructions: buildRealtimeInstructions(),
    output_modalities: ["audio"],
    tools: realtimeTools,
    tool_choice: "auto",
    max_output_tokens: 160,
    truncation: {
      type: "retention_ratio",
      retention_ratio: 0.8
    },
    audio: {
      input: {
        format: { type: "audio/pcmu" },
        noise_reduction: { type: "near_field" },
        transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "en",
          prompt: `British English restaurant phone call for ${businessConfig.businessName}. Expect names, dates, times, simple business questions and table bookings.`
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "high",
          create_response: true,
          interrupt_response: true
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
    let latestInboundTimestamp = 0;
    let sessionConfigured = false;
    let greetingStarted = false;
    let closed = false;
    let pendingHangupMark = null;

    let currentAssistantItemId = null;
    let responseStartTimestampTwilio = null;
    let assistantAudioMsSent = 0;

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

    const maybeStartGreeting = () => {
      if (!sessionConfigured || !streamSid || greetingStarted) return;
      greetingStarted = true;
      safeSend(openaiSocket, {
        type: "response.create",
        response: {
          instructions: `Give one warm, brief phone greeting. Preserve the meaning of: ${businessConfig.greeting}. Then stop and listen.`
        }
      });
    };

    const flushQueuedAudio = () => {
      if (!sessionConfigured || openaiSocket.readyState !== WebSocket.OPEN) return;
      while (queuedAudio.length) {
        const audio = queuedAudio.shift();
        safeSend(openaiSocket, { type: "input_audio_buffer.append", audio });
      }
    };

    const interruptAssistant = () => {
      if (!streamSid || context.endCallRequested) return;

      safeSend(twilioSocket, { event: "clear", streamSid });

      if (currentAssistantItemId && responseStartTimestampTwilio !== null && assistantAudioMsSent > 0) {
        const elapsed = Math.max(0, latestInboundTimestamp - responseStartTimestampTwilio);
        const audioEndMs = Math.max(0, Math.min(Math.floor(elapsed), Math.floor(assistantAudioMsSent)));

        if (audioEndMs > 0) {
          safeSend(openaiSocket, {
            type: "conversation.item.truncate",
            item_id: currentAssistantItemId,
            content_index: 0,
            audio_end_ms: audioEndMs
          });
        }
      }

      currentAssistantItemId = null;
      responseStartTimestampTwilio = null;
      assistantAudioMsSent = 0;
    };

    openaiSocket.on("open", () => {
      safeSend(openaiSocket, {
        type: "session.update",
        session: createSessionConfig()
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
        const timestamp = Number(msg.media.timestamp);
        if (Number.isFinite(timestamp)) latestInboundTimestamp = timestamp;

        if (context.endCallRequested) return;

        if (!sessionConfigured || openaiSocket.readyState !== WebSocket.OPEN) {
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
        if (openaiSocket.readyState === WebSocket.OPEN || openaiSocket.readyState === WebSocket.CONNECTING) {
          openaiSocket.close(1000, "Twilio stream stopped");
        }
      }
    });

    openaiSocket.on("message", async raw => {
      const event = parseJson(raw);
      if (!event) return;

      if (event.type === "session.updated") {
        sessionConfigured = true;
        flushQueuedAudio();
        maybeStartGreeting();
        return;
      }

      if (event.type === "response.output_audio.delta" && event.delta && streamSid) {
        if (currentAssistantItemId !== event.item_id) {
          currentAssistantItemId = event.item_id || null;
          responseStartTimestampTwilio = latestInboundTimestamp;
          assistantAudioMsSent = 0;
        }

        try {
          assistantAudioMsSent += Buffer.from(event.delta, "base64").length / 8;
        } catch {
          // Keep the call alive if malformed audio is ever returned.
        }

        safeSend(twilioSocket, {
          event: "media",
          streamSid,
          media: { payload: event.delta }
        });
        return;
      }

      if (event.type === "response.output_audio.done" && streamSid) {
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

      if (event.type === "input_audio_buffer.speech_started") {
        interruptAssistant();
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
              ? "Say one short friendly goodbye only. Do not ask anything else."
              : "Continue naturally from the tool result. Give the direct answer first. Do not repeat questions whose answers are already known."
          }
        });
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
      clearInterval(heartbeat);
      queuedAudio.length = 0;
      context.savedBookings.clear();
    };

    twilioSocket.on("error", error => {
      console.error("Twilio websocket error:", error.message || error);
      cleanup();
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    });

    twilioSocket.on("close", () => {
      cleanup();
      if (openaiSocket.readyState === WebSocket.OPEN || openaiSocket.readyState === WebSocket.CONNECTING) {
        openaiSocket.close();
      }
    });

    openaiSocket.on("error", error => {
      console.error("OpenAI websocket error:", error.message || error);
      cleanup();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close(1011, "AI connection failed");
    });

    openaiSocket.on("close", () => {
      cleanup();
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    });
  });

  wss.on("error", error => {
    console.error("Media stream server error:", error.message || error);
  });
}
