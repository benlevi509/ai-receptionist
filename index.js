import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { resolveBusinessForCall } from "./businessResolver.js";
import { mediaStreamResponse } from "./twilio.js";
import { attachRealtimeBridge } from "./realtime.js";

const app = express();
app.set("trust proxy", true);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: "100kb" }));
app.get("/", (req,res)=>res.status(200).send("AI receptionist service is live."));
app.get("/health", (req,res)=>{const ready=Boolean(process.env.OPENAI_API_KEY&&process.env.GOOGLE_SHEET_ID&&process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY);res.status(ready?200:503).json({ok:ready});});
app.post("/stream-status",(req,res)=>{const event=String(req.body.StreamEvent||"unknown"),error=String(req.body.StreamError||"").trim(),callSid=String(req.body.CallSid||"").trim(),streamSid=String(req.body.StreamSid||"").trim();if(event==="stream-error"||error)console.error(`Twilio stream failure: event=${event} call=${callSid||"unknown"} stream=${streamSid||"unknown"} error=${error||"unspecified"}`);res.sendStatus(204);});
app.post("/voice",async(req,res)=>{try{const host=process.env.PUBLIC_HOST||req.get("host"),callerNumber=String(req.body.From||"").trim(),calledNumber=String(req.body.To||"").trim(),callSid=String(req.body.CallSid||"").trim();await resolveBusinessForCall(callSid,calledNumber);res.type("text/xml");res.send(mediaStreamResponse(host,{callerNumber,calledNumber,callSid}));}catch(error){console.error("Failed to start voice stream:",error.message||error);res.type("text/xml");res.status(500).send("<Response><Say>Sorry, the phone service is temporarily unavailable.</Say><Hangup/></Response>");}});
const PORT=Number(process.env.PORT)||10000;const server=http.createServer(app);attachRealtimeBridge(server);server.listen(PORT,()=>console.log(`AI receptionist realtime bridge running on port ${PORT}`));
