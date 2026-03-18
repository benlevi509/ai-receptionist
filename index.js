import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- CURRENT DATE ---------- */

const today = new Date().toDateString();

/* ---------- SYSTEM PROMPT ---------- */

const SYSTEM_PROMPT = `
You are a restaurant receptionist answering the phone.

Today's date is ${today}.

Rules:
- Maximum 10 words per response
- Ask ONE question only
- Never say "how are you"
- Never introduce yourself
- Never speak in paragraphs
- Never repeat questions
- Never give long explanations
- Speak like a real busy receptionist

Booking information required:
1. number of guests
2. date
3. time
4. name

Example replies:
"For how many guests?"
"What time would you like?"
"What name is the booking under?"

Never speak more than one sentence.
`;

let conversationHistory = [
  { role: "system", content: SYSTEM_PROMPT }
];

/* ---------- TEST AI ---------- */

app.get("/test-ai", async (req, res) => {

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
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

<Say>Benji's Restaurant. How can I help?</Say>

<Gather input="speech" timeout="2" action="/process-speech" method="POST">
<Say>Please tell me your booking request.</Say>
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
<Say>Sorry, please repeat.</Say>

<Gather input="speech" timeout="2" action="/process-speech" method="POST"/>

</Response>
`;

    res.type("text/xml");
    res.send(twiml);
    return;

  }

/* ---------- GOODBYE DETECTION ---------- */

  const goodbyeWords = ["bye", "goodbye", "thanks bye"];

  if (goodbyeWords.some(word => lowerSpeech.includes(word))) {

    const twiml = `
<Response>
<Say>Goodbye.</Say>
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
    temperature: 0.2,
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

<Gather input="speech" timeout="2" action="/process-speech" method="POST">
<Say>Anything else?</Say>
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