import WebSocket, { WebSocketServer } from "ws";
import businessConfig from "./businessConfig.js";

function instructions() {
  return `You are the phone receptionist for ${businessConfig.businessName}, a ${businessConfig.businessType}.
${businessConfig.tone}
Address: ${businessConfig.address}. Opening hours: ${JSON.stringify(businessConfig.openingHours)}.
Menu: ${JSON.stringify(businessConfig.menu)}. Common questions: ${JSON.stringify(businessConfig.commonQuestions)}.
Keep replies short and natural because this is a phone call. Ask only one question at a time. Never invent business information. If you do not know, say so briefly. For bookings, gather party size, date, time, and name. Do not claim a booking is confirmed until the server booking tool has confirmed it.`;
}

export function attachRealtimeBridge(server) {
  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (twilioSocket) => {
    let streamSid = null;
    const openaiSocket = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(process.env.OPENAI_REALTIME_MODEL || "gpt-realtime")}`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    const sendToOpenAI = (event) => {
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.send(JSON.stringify(event));
    };

    openaiSocket.on("open", () => {
      sendToOpenAI({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: instructions(),
          audio: {
            input: {
              format: { type: "audio/pcmu" },
              turn_detection: { type: "server_vad", create_response: true, interrupt_response: true }
            },
            output: {
              format: { type: "audio/pcmu" },
              voice: process.env.OPENAI_REALTIME_VOICE || "marin"
            }
          }
        }
      });

      sendToOpenAI({
        type: "response.create",
        response: {
          instructions: `Greet the caller exactly once, naturally. Start from this meaning: ${businessConfig.greeting}`
        }
      });
    });

    twilioSocket.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.event === "start") streamSid = msg.start?.streamSid || msg.streamSid;
      if (msg.event === "media" && msg.media?.payload) {
        sendToOpenAI({ type: "input_audio_buffer.append", audio: msg.media.payload });
      }
      if (msg.event === "stop" && openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    });

    openaiSocket.on("message", (raw) => {
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return; }

      if (event.type === "response.output_audio.delta" && event.delta && streamSid) {
        twilioSocket.send(JSON.stringify({ event: "media", streamSid, media: { payload: event.delta } }));
      }

      if (event.type === "input_audio_buffer.speech_started" && streamSid) {
        twilioSocket.send(JSON.stringify({ event: "clear", streamSid }));
      }

      if (event.type === "error") console.error("OpenAI Realtime error:", event.error || event);
    });

    const closeBoth = () => {
      if (twilioSocket.readyState === WebSocket.OPEN) twilioSocket.close();
      if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
    };

    twilioSocket.on("error", closeBoth);
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
