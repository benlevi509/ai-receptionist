import WebSocket, { WebSocketServer } from "ws";
import businessConfig from "./businessConfig.js";
import { realtimeTools, runRealtimeTool } from "./realtimeTools.js";

function buildInstructions() {
  return `You are the phone receptionist for ${businessConfig.businessName}, a ${businessConfig.businessType}.

VOICE AND STYLE
${businessConfig.tone}
Speak naturally, warmly and briefly. This is a real phone call, not a chatbot. Avoid long lists and avoid repeatedly saying sorry. Ask one question at a time. Let the caller interrupt you naturally. Do not repeat information unless useful.

BUSINESS INFORMATION
Address: ${businessConfig.address}
Opening hours: ${JSON.stringify(businessConfig.openingHours)}
Menu: ${JSON.stringify(businessConfig.menu)}
Common questions: ${JSON.stringify(businessConfig.commonQuestions)}
Fallback: ${businessConfig.fallback}

BOOKINGS
Keep the existing receptionist behaviour: gather party size, date, time and name conversationally. Maximum party size is ${businessConfig.bookingSettings?.maximumPartySize || 6}.
Before saying a requested date/time is available, call check_availability.
Before saving, briefly confirm the final party size, date, time and name with the caller. Only after they clearly confirm, call create_booking.
Never say a booking is confirmed unless create_booking returns confirmed=true.
If a requested slot is unavailable and the tool provides a suggestion, offer that suggestion naturally.
When speaking a date that is today or tomorrow, prefer saying today/tomorrow. The booking tool will still save the real date to the sheet.
If you do not know business information, do not invent it.
`;
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function parseArguments(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export function attachRealtimeBridge(server) {
  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (twilioSocket) => {
    let streamSid = null;
    let callerNumber = "";

    if (!process.env.OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY environment variable.");
      twilioSocket.close();
      return;
    }

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
    const openaiSocket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    openaiSocket.on("open", () => {
      safeSend(openaiSocket, {
        type: "session.update",
        session: {
          type: "realtime",
          instructions: buildInstructions(),
          output_modalities: ["audio"],
          tools: realtimeTools,
          tool_choice: "auto",
          max_output_tokens: 220,
          audio: {
            input: {
              format: { type: "audio/pcmu" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 650,
                idle_timeout_ms: 12000,
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
        }
      });

      safeSend(openaiSocket, {
        type: "response.create",
        response: {
          instructions: `Greet the caller once, naturally and briefly. Use this greeting as the meaning, not necessarily word-for-word: ${businessConfig.greeting}`
        }
      });
    });

    twilioSocket.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.event === "start") {
        streamSid = msg.start?.streamSid || msg.streamSid || null;
        callerNumber = String(msg.start?.customParameters?.callerNumber || "").trim();
        return;
      }

      if (msg.event === "media" && msg.media?.payload) {
        safeSend(openaiSocket, {
          type: "input_audio_buffer.append",
          audio: msg.media.payload
        });
        return;
      }

      if (msg.event === "stop") {
        if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
      }
    });

    openaiSocket.on("message", async (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
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

      if (event.type === "input_audio_buffer.speech_started" && streamSid) {
        safeSend(twilioSocket, { event: "clear", streamSid });
        return;
      }

      if (event.type === "response.function_call_arguments.done") {
        const args = parseArguments(event.arguments);
        let result;

        try {
          result = await runRealtimeTool(event.name, args, { callerNumber });
        } catch (error) {
          console.error(`Realtime tool ${event.name} failed:`, error.message || error);
          result = { ok: false, reason: "tool_error" };
        }

        safeSend(openaiSocket, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: event.call_id,
            output: JSON.stringify(result)
          }
        });

        safeSend(openaiSocket, { type: "response.create" });
        return;
      }

      if (event.type === "error") {
        console.error("OpenAI Realtime error:", event.error || event);
      }
    });

    twilioSocket.on("error", (error) => {
      console.error("Twilio websocket error:", error.message || error);
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    });

    twilioSocket.on("close", () => {
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    });

    openaiSocket.on("error", (error) => {
      console.error("OpenAI websocket error:", error.message || error);
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    });

    openaiSocket.on("close", () => {
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
    });
  });
}
