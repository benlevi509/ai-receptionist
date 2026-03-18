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

/* ---------- SYSTEM PROMPT ---------- */

const SYSTEM_PROMPT = `
You are the receptionist for Benji's Restaurant.

Today's date is ${today}.

Speak like a real human receptionist answering the phone.

Rules:
- Maximum 15 words per response
- Ask ONE question at a time
- Never repeat questions already answered
- Be polite and natural
- If a caller says tomorrow or today, interpret the correct date
- Guide the customer through a booking step by step

Booking information needed:
1. number of guests
2. date
3. time
4. name

Example tone:
"For how many people?"
"What time would you like the table?"
"May I take your name please?"

Never speak in long paragraphs.
`;

let conversationHistory = [
  { role: "system", content: SYSTEM_PROMPT }
];

/* ---------- TEST AI ---------- */

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
<Say>Hello, thank you for calling Benji's Restaurant. How may I help you today?</Say>

<Gather input="speech" timeout="5" action="/process-speech" method="POST">
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

/* ---------- SILENCE DETECTION ---------- */

  if (!speech) {

    const twiml = `
<Response>
<Say>Sorry, I didn't catch that. Could you repeat please?</Say>

<Gather input="speech" timeout="5" action="/process-speech" method="POST"/>

</Response>
`;

    res.type("text/xml");
    res.send(twiml);
    return;

  }

/* ---------- GOODBYE DETECTION ---------- */

  const goodbyeWords = ["bye", "goodbye", "see you", "thanks bye"];

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

/* ---------- OPENAI RESPONSE ---------- */

  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: conversationHistory
  });

  const reply = aiResponse.choices[0].message.content;

  conversationHistory.push({
    role: "assistant",
    content: reply
  });

/* ---------- TWILIO RESPONSE ---------- */

  const twiml = `
<Response>

<Say>${reply}</Say>

<Gather input="speech" timeout="5" action="/process-speech" method="POST">
<Say>Anything else I can help with?</Say>
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