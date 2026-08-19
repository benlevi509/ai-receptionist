import express from "express";
import bodyParser from "body-parser";
import http from "http";

import businessConfig from "./businessConfig.js";
import { resolveBusinessForCall } from "./businessResolver.js";
import { mediaStreamResponse } from "./twilio.js";
import { attachRealtimeBridge } from "./realtime.js";

const app = express();
app.set("trust proxy", true);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.status(200).send(`${businessConfig.businessName} AI receptionist is live.`);
});

app.get("/health", (req, res) => {
  const ready = Boolean(process.env.OPENAI_API_KEY && process.env.GOOGLE_SHEET_ID);
  res.status(ready ? 200 : 503).json({ ok: ready });
});

app.post("/stream-status", (req, res) => {
  const event = String(req.body.StreamEvent || "unknown");
  const error = String(req.body.StreamError || "").trim();
  const callSid = String(req.body.CallSid || "").trim();
  const streamSid = String(req.body.StreamSid || "").trim();

  if (event === "stream-error" || error) {
    console.error(`Twilio stream failure: event=${event} call=${callSid || "unknown"} stream=${streamSid || "unknown"} error=${error || "unspecified"}`);
  } else {
    console.log(`Twilio stream status: event=${event} call=${callSid || "unknown"} stream=${streamSid || "unknown"}`);
  }

  res.sendStatus(204);
});

app.post("/voice", async (req, res) => {
  try {
    const host = process.env.PUBLIC_HOST || req.get("host");
    const callerNumber = String(req.body.From || "").trim();
    const calledNumber = String(req.body.To || "").trim();
    const callSid = String(req.body.CallSid || "").trim();

    await resolveBusinessForCall(callSid, calledNumber);

    res.type("text/xml");
    res.send(mediaStreamResponse(host, { callerNumber, calledNumber, callSid }));
  } catch (error) {
    console.error("Failed to start voice stream:", error.message || error);
    res.type("text/xml");
    res.status(500).send("<Response><Say>Sorry, the phone service is temporarily unavailable.</Say><Hangup/></Response>");
  }
});

const PORT = Number(process.env.PORT) || 10000;
const server = http.createServer(app);
attachRealtimeBridge(server);

server.listen(PORT, () => {
  console.log(`${businessConfig.businessName} realtime bridge running on port ${PORT}`);
});
