import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- STATE ---------- */

let conversationHistory = [];
let booking = {
  people: null,
  date: null,
  time: null,
  name: null
};
let bookingActive = false;
let lastQuestion = null;

/* ---------- HELPERS ---------- */

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

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hasAllBookingDetails() {
  return booking.people && booking.date && booking.time && booking.name;
}

function isEndingPhrase(text) {
  const lower = text.toLowerCase();

  return [
    "bye",
    "goodbye",
    "that'll be all",
    "that will be all",
    "that's all",
    "thats all",
    "nothing else",
    "no thanks",
    "no thank you",
    "all good",
    "that's everything",
    "thats everything"
  ].some(phrase => lower.includes(phrase));
}

function wantsBooking(text) {
  const lower = text.toLowerCase();

  return [
    "book",
    "booking",
    "reservation",
    "reserve",
    "table"
  ].some(word => lower.includes(word));
}

function twilioSayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Gather input="speech" timeout="4" speechTimeout="1" action="/process-speech" method="POST">
</Gather>
<Say voice="Polly.Brian" language="en-GB">Sorry, I didn't catch that.</Say>
<Gather input="speech" timeout="4" speechTimeout="1" action="/process-speech" method="POST">
</Gather>
<Say voice="Polly.Brian" language="en-GB">Thanks for calling. Have a great day.</Say>
<Hangup/>
</Response>
`;
}

function twilioSayAndHangup(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Hangup/>
</Response>
`;
}

/* ---------- AI PROMPTS ---------- */

function getReceptionistPrompt() {
  return `
You are a clear, natural phone receptionist for Benji's Restaurant.

Current date and time: ${getCurrentDateTime()}

Style:
- Sound clear, relaxed, and human.
- Do not sound posh, formal, robotic, or overly cheerful.
- Maximum 12 words per reply.
- Ask one question at a time.
- Never say "how are you".
- Never mention AI.
- Do not overuse "of course".
- Vary your wording naturally.
- Speak in one sentence only.

Opening style:
"Hello, welcome to Benji's Restaurant. Would you like to make a reservation, ask about the menu, or something else?"

Booking wording:
Say "How many people is the table for?"
Do not say "guests joining you".

After confirming a booking:
Ask "Anything else I can help with?"

If finished:
Say "Perfect, thanks for calling. Have a great day."
`;
}

async function extractBookingDetails(speech) {
  const extractionPrompt = `
Current date and time: ${getCurrentDateTime()}

Extract booking details from the caller's sentence.

Return ONLY valid JSON.
No explanation.

Fields:
{
  "people": string or null,
  "date": string or null,
  "time": string or null,
  "name": string or null,
  "askingAvailability": true or false
}

Rules:
- If they say "is 16th June free", date is "16th June" and askingAvailability is true.
- If they say "for 4 people", people is "4 people".
- If they say "at 7", time is "7pm" unless clearly morning.
- Extract only the useful detail, not the full sentence.
- Do not invent missing fields.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: "system", content: extractionPrompt },
      { role: "user", content: speech }
    ]
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return {
      people: null,
      date: null,
      time: null,
      name: null,
      askingAvailability: false
    };
  }
}

async function getGeneralAIReply(speech) {
  const messages = [
    { role: "system", content: getReceptionistPrompt() },
    ...conversationHistory.slice(-6),
    { role: "user", content: speech }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    max_tokens: 35,
    messages
  });

  return response.choices[0].message.content.trim();
}

/* ---------- BOOKING LOGIC ---------- */

async function handleBookingSpeech(speech) {
  const extracted = await extractBookingDetails(speech);

  if (extracted.people) booking.people = extracted.people;
  if (extracted.date) booking.date = extracted.date;
  if (extracted.time) booking.time = extracted.time;
  if (extracted.name) booking.name = extracted.name;

  if (extracted.askingAvailability && booking.date && !booking.time) {
    lastQuestion = "time";
    return `Yes, ${booking.date} should be fine. What time would you like?`;
  }

  if (!booking.people) {
    lastQuestion = "people";
    return "Sure, how many people is the table for?";
  }

  if (!booking.date) {
    lastQuestion = "date";
    return "Great, what date would you like?";
  }

  if (!booking.time) {
    lastQuestion = "time";
    return "Nice, what time would you like?";
  }

  if (!booking.name) {
    lastQuestion = "name";
    return "Lovely, what name should I put it under?";
  }

  if (hasAllBookingDetails()) {
    bookingActive = false;
    lastQuestion = null;

    return `Perfect, table for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Anything else I can help with?`;
  }

  return "Sorry, could you say that again?";
}

/* ---------- ROUTES ---------- */

app.get("/test-ai", async (req, res) => {
  res.send("AI receptionist is running.");
});

app.post("/voice", (req, res) => {
  conversationHistory = [];
  booking = {
    people: null,
    date: null,
    time: null,
    name: null
  };
  bookingActive = false;
  lastQuestion = null;

  const opening =
    "Hi, Benji's Restaurant. Would you like to make a reservation, ask about the menu, or something else?";

  res.type("text/xml");
  res.send(twilioSayAndGather(opening));
});

app.post("/process-speech", async (req, res) => {
  const speech = req.body.SpeechResult || "";

  if (!speech.trim()) {
    res.type("text/xml");
    res.send(twilioSayAndGather("Sorry, could you say that again?"));
    return;
  }

  if (isEndingPhrase(speech)) {
    res.type("text/xml");
    res.send(twilioSayAndHangup("Perfect, thanks for calling. Have a great day."));
    return;
  }

  let reply = "";

  try {
    if (bookingActive || wantsBooking(speech)) {
      bookingActive = true;
      reply = await handleBookingSpeech(speech);
    } else {
      reply = await getGeneralAIReply(speech);
    }
  } catch (error) {
    console.error(error);
    reply = "Sorry, could you say that again?";
  }

  conversationHistory.push({ role: "user", content: speech });
  conversationHistory.push({ role: "assistant", content: reply });

  res.type("text/xml");
  res.send(twilioSayAndGather(reply));
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
