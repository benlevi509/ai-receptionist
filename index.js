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
- Maximum 15 words per reply
- Ask ONE question at a time
- Never say "how are you"
- Never introduce yourself
- Never speak in paragraphs
- Never repeat questions
- Speak like a busy restaurant receptionist
- If the caller asks a question, answer it briefly first
- If the caller asks about availability (for example "is there space tomorrow"), respond naturally and ask what time they prefer

Booking information required:
1. number of guests
2. date
3. time
4. name

When confirming booking dates:

- If the booking is today, say "today".
- If the booking is tomorrow, say "tomorrow".
- If the booking is another day, say the weekday and date only.

Example:
"Thursday the 28th of March at 7pm."

Never say the year.
Never say the full long date.
Keep it natural like a human receptionist.

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
timeout