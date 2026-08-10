import express from "express";
import bodyParser from "body-parser";
import http from "http";

import businessConfig from "./businessConfig.js";
import { mediaStreamResponse } from "./twilio.js";
import { attachRealtimeBridge } from "./realtime.js";

const app = express();
app.set("trust proxy", true);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.status(200).send(`${businessConfig.businessName} AI receptionist is live.`);
});

app.get("/health", (req, res) => res.status(200).send("OK"));

app.post("/voice", (req, res) => {
  const host = process.env.PUBLIC_HOST || req.get("host");
  const callerNumber = String(req.body.From || "").trim();

  res.type("text/xml");
  res.send(mediaStreamResponse(host, callerNumber));
});

const PORT = process.env.PORT || 10000;
const server = http.createServer(app);
attachRealtimeBridge(server);

server.listen(PORT, () => {
  console.log(`${businessConfig.businessName} realtime bridge running on port ${PORT}`);
});
