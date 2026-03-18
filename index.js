import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- CURRENT DATE + TIME ---------- */

function getCurrentDateTime() {
  const now = new Date();
  return now.toLocaleString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* ---------- SYSTEM PROMPT ---------- */

function getSystemPrompt() {

const currentDateTime = getCurrentDateTime();

return `
You are the phone receptionist for Benji's Restaurant.

Current date and time: ${currentDateTime}

Rules:
- Maximum 10 words per reply
- Ask ONE question at a time
- Never say "how are you"
- Never introduce yourself
- Never speak in paragraphs
- Never repeat questions
- Speak like a busy restaurant receptionist

Booking information required:
1. number of guests
2. date
3. time
4. name

If the caller says words like:
"today"
"tomorrow"
"tonight"
"next Friday"

You must understand the correct calendar date using the current date.

Example replies:
"For how many guests?"
"What time would you like?"
"What name is the booking under?"

Never speak more than one sentence.
`;
}

let conversationHistory = [
  { role: "system", content: getSystemPrompt() }
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
    { role: "system", content: getSystemPrompt() }
  ];

  const twiml = `
<Response>

<Say>Hello and welcome to Benji's Restaurant. How may I help you today?</Say>

<Gather input="speech"
timeout="9"
action="/process-speech"
method="POST">

</Gather>

<Say>Sorry, are you still there?</Say>

<Gather input="speech"
timeout="6"
action="/process-speech"
method="POST">

</Gather>

<Say>I'll end the call now. Goodbye.</Say>
<Hangup/>

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

<Gather input="speech"
timeout="9"
action="/process-speech"
method="POST">

</Gather>

<Say>Sorry, are you still there?</Say>

<Gather input="speech"
timeout="6"
action="/process-speech"
method="POST">

</Gather>

<Say>I'll end the call now. Goodbye.</Say>
<Hangup/>

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