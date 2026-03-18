
import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- CURRENT DATE FOR AI ---------- */

const today = new Date().toDateString();

/* ---------- AI SYSTEM PROMPT ---------- */

const SYSTEM_PROMPT = `
You are a professional restaurant receptionist for Benji's Restaurant.

Today's date is ${today}.

Rules:
- Speak naturally like a human receptionist.
- Keep responses under 20 words.
- Ask ONE question at a time.
- Never ask for information the customer already gave.
- If the customer says "tomorrow" or "today", understand the correct date.
- If the caller says goodbye, end the conversation politely.

If taking a booking, collect:
1) number of people
2) date
3) time
4) name

Always sound friendly and helpful.
`;

let conversationHistory = [
  { role: "system", content: SYSTEM_PROMPT }
];

/* ---------- TEST ROUTE ---------- */

app.get("/test-ai", async (req, res) => {

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: conversationHistory
  });

  res.send(response.choices[0].message.content);
});

/* ---------- VOICE ROUTE ---------- */

app.post("/voice", (req, res) => {

  conversationHistory = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  const twiml = `
<Response>
<Say>Hello, thank you for calling Benji's Restaurant. How can I help today?</Say>
<Gather input="speech" action="/process-speech" method="POST">
<Say>Please tell me how I can help.</Say>
</Gather>
</Response>
`;

  res.type("text/xml");
  res.send(twiml);
});

/* ---------- PROCESS SPEECH ---------- */

app.post("/process-speech", async (req, res) => {

  const speech = req.body.SpeechResult || "";

  const lowerSpeech = speech.toLowerCase();

/* ---------- GOODBYE DETECTION ---------- */

  const goodbyeWords = ["bye", "goodbye", "thanks bye", "see you"];

  if (goodbyeWords.some(word => lowerSpeech.includes(word))) {

    const twiml = `
<Response>
<Say>Goodbye. We look forward to seeing you at Benji's Restaurant.</Say>
<Hangup/>
</Response>
`;

    res.type("text/xml");
    res.send(twiml);
    return;
  }

/* ---------- ADD USER MESSAGE ---------- */

  conversationHistory.push({
    role: "user",
    content: speech
  });

/* ---------- ASK OPENAI ---------- */

  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: conversationHistory
  });

  const reply = aiResponse.choices[0].message.content;

  conversationHistory.push({
    role: "assistant",
    content: reply
  });

/* ---------- RESPOND WITH VOICE ---------- */

  const twiml = `
<Response>
<Say>${reply}</Say>
<Gather input="speech" action="/process-speech" method="POST">
<Say>Is there anything else I can help with?</Say>
</Gather>
</Response>
`;

  res.type("text/xml");
  res.send(twiml);
});

/* ---------- SERVER ---------- */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});