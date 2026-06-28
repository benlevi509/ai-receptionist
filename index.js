import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let conversationHistory = [];
let booking = {};
let bookingActive = false;
let bookingStep = null;
let pendingTime = null;

/* ---------- HELPERS ---------- */

function randomChoice(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function titleCase(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function getSuffix(day) {
  const n = Number(day);
  if (n >= 11 && n <= 13) return "th";
  if (n % 10 === 1) return "st";
  if (n % 10 === 2) return "nd";
  if (n % 10 === 3) return "rd";
  return "th";
}

function formatDate(text) {
  const lower = text.toLowerCase();

  if (lower.includes("today")) return "today";
  if (lower.includes("tomorrow")) return "tomorrow";

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];

  for (const month of months) {
    const regex = new RegExp(`(\\d{1,2})(st|nd|rd|th)?\\s*(of\\s+)?${month}`, "i");
    const match = lower.match(regex);

    if (match) {
      const day = match[1];
      const suffix = match[2] || getSuffix(day);
      return `the ${day}${suffix} of ${titleCase(month)}`;
    }
  }

  return null;
}

function extractPeople(text) {
  const lower = text.toLowerCase();

  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12
  };

  const phraseNumber = lower.match(/\b(?:for|table for|party of)\s+(\d+)\b/);
  if (phraseNumber) return `${phraseNumber[1]} people`;

  const explicitPeople = lower.match(/\b(\d+)\s*(people|persons|guests|of us)\b/);
  if (explicitPeople) return `${explicitPeople[1]} people`;

  for (const word in words) {
    const phraseWord = new RegExp(`\\b(?:for|table for|party of)\\s+${word}\\b`, "i");
    if (phraseWord.test(lower)) return `${words[word]} people`;

    const explicitWord = new RegExp(`\\b${word}\\s*(people|persons|guests|of us)\\b`, "i");
    if (explicitWord.test(lower)) return `${words[word]} people`;
  }

  if (bookingStep === "people") {
    const bareNumber = lower.match(/\b(\d+)\b/);
    if (bareNumber) return `${bareNumber[1]} people`;

    for (const word in words) {
      if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
        return `${words[word]} people`;
      }
    }
  }

  return null;
}

function extractTime(text) {
  const lower = text.toLowerCase();

  const halfTimes = {
    "half six": "6:30pm",
    "half seven": "7:30pm",
    "half eight": "8:30pm",
    "half nine": "9:30pm",
    "half ten": "10:30pm"
  };

  for (const phrase in halfTimes) {
    if (lower.includes(phrase)) return halfTimes[phrase];
  }

  const explicitTime = lower.match(/\b(\d{1,2})(:\d{2})?\s*(pm|am)\b/);
  if (explicitTime) {
    return explicitTime[1] + (explicitTime[2] || "") + explicitTime[3];
  }

  const oclockTime = lower.match(/\b(\d{1,2})\s*(o'clock|oclock)\b/);
  if (oclockTime) {
    return oclockTime[1] + "pm";
  }

  const casualTime = lower.match(/\b(?:for|at|space at|availability at)\s+(\d{1,2})(:\d{2})?\b/);
  if (casualTime) {
    return casualTime[1] + (casualTime[2] || "") + "pm";
  }

  if (bookingStep === "time") {
    const bareNumber = lower.match(/\b(\d{1,2})\b/);
    if (bareNumber) return bareNumber[1] + "pm";
  }

  return null;
}

function extractName(text) {
  let cleaned = text.toLowerCase();

  cleaned = cleaned
    .replace(/^(it's|its|it is)\s+/i, "")
    .replace(/^under\s+/i, "")
    .replace(/^for\s+/i, "")
    .replace(/^my name is\s+/i, "")
    .replace(/^the name is\s+/i, "")
    .replace(/^name is\s+/i, "")
    .replace(/^put it under\s+/i, "")
    .replace(/^can you put it under\s+/i, "")
    .replace(/^book it under\s+/i, "")
    .replace(/^reservation under\s+/i, "")
    .replace(/please/gi, "")
    .replace(/thank you/gi, "")
    .replace(/thanks/gi, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length > 3) {
    cleaned = words.slice(-2).join(" ");
  }

  return cleaned
    ? cleaned.split(" ").map(titleCase).join(" ")
    : null;
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
    "nope",
    "no that's it",
    "no thats it",
    "all good",
    "that's everything",
    "thank you bye",
    "thanks bye"
  ].some(p => lower.includes(p));
}

function wantsBooking(text) {
  const lower = text.toLowerCase();

  return [
    "book",
    "booking",
    "reservation",
    "reserve",
    "table",
    "space",
    "availability"
  ].some(p => lower.includes(p));
}

function asksAvailability(text) {
  const lower = text.toLowerCase();

  return [
    "do you have availability",
    "have you got availability",
    "is there availability",
    "are you available",
    "anything available",
    "do you have space",
    "have you got space",
    "is there space",
    "space at",
    "availability at"
  ].some(p => lower.includes(p));
}

function confirms(text) {
  const lower = text.toLowerCase();

  return [
    "yes",
    "yeah",
    "yep",
    "that's fine",
    "thats fine",
    "perfect",
    "go ahead",
    "book it",
    "put it down",
    "that works",
    "sounds good",
    "please do",
    "yes please"
  ].some(p => lower.includes(p));
}

/* ---------- TWILIO ---------- */

function sayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Gather input="speech" timeout="10" speechTimeout="1.2" action="/process-speech" method="POST"></Gather>
<Say voice="Polly.Brian" language="en-GB">Sorry, I didn't catch that.</Say>
<Gather input="speech" timeout="20" speechTimeout="1.2" action="/process-speech" method="POST"></Gather>
<Say voice="Polly.Brian" language="en-GB">Thanks for calling. Have a great day.</Say>
<Pause length="1"/>
<Hangup/>
</Response>
`;
}

function sayAndHangup(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Pause length="1"/>
<Hangup/>
</Response>
`;
}

/* ---------- GENERAL AI ---------- */

async function getGeneralReply(speech) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.45,
    max_tokens: 28,
    messages: [
      {
        role: "system",
        content: `
You are a natural phone receptionist for Benji's Restaurant.
Maximum 10 words.
Sound relaxed, clear, and human.
Never say "would you like to know more?"
Never say "enjoy your time at Benji's" unless a booking is fully confirmed.
After helping, ask: "Is there anything else I can help with?"
Only mention reservations if it fits naturally.
Ask one question at a time.
Never mention AI.
Do not start every sentence with okay.
Vary sentence starters naturally.
`
      },
      ...conversationHistory.slice(-4),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}

/* ---------- BOOKING ---------- */

function handleBooking(speech) {
  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);
  const availabilityQuestion = asksAvailability(speech);

  if (people && !booking.people) booking.people = people;
  if (date && !booking.date) booking.date = date;

  if (pendingTime && confirms(speech)) {
    booking.time = pendingTime;
    pendingTime = null;
  }

  if (time && !booking.time) {
    if (availabilityQuestion) {
      pendingTime = time;
      return `Yes, we should have space at ${time}. Shall I book that for you?`;
    }

    booking.time = time;
  }

  if (bookingStep === "name") {
    booking.name = extractName(speech);
  }

  if (!booking.people) {
    bookingStep = "people";
    return randomChoice([
      "Sure, how many people is the table for?",
      "No problem, how many people is that for?",
      "Great, how many people will that be?"
    ]);
  }

  if (!booking.date) {
    bookingStep = "date";
    return randomChoice([
      "Great, what date would you like?",
      "Perfect, and what date should that be?",
      "Lovely, what date works best?"
    ]);
  }

  if (!booking.time) {
    bookingStep = "time";
    return randomChoice([
      "Great, and what time would you like?",
      "Perfect, what time should I put down?",
      "Lovely, what time should that be for?"
    ]);
  }

  if (!booking.name) {
    bookingStep = "name";
    return randomChoice([
      "Great, what name should I put it under?",
      "Perfect, and what's the name please?",
      "Lovely, what name is that under?"
    ]);
  }

  bookingActive = false;
  bookingStep = null;
  pendingTime = null;

  return randomChoice([
    `Perfect, table for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can help with?`,
    `Lovely, that's ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can help with?`,
    `Great, you're booked for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can help with?`
  ]);
}

/* ---------- ROUTES ---------- */

app.get("/test-ai", (req, res) => {
  res.send("AI receptionist is running.");
});

app.post("/voice", (req, res) => {
  conversationHistory = [];
  booking = {};
  bookingActive = false;
  bookingStep = null;
  pendingTime = null;

  res.type("text/xml");
  res.send(
    sayAndGather(
      "Hello, welcome to Benji's Restaurant. Would you like to make a reservation, ask about the menu, or something else?"
    )
  );
});

app.post("/process-speech", async (req, res) => {
  const speech = req.body.SpeechResult || "";

  if (!speech.trim()) {
    res.type("text/xml");
    res.send(sayAndGather("Sorry, could you say that again?"));
    return;
  }

  if (isEndingPhrase(speech)) {
    res.type("text/xml");
    res.send(sayAndHangup("No problem, thanks for calling. Goodbye."));
    return;
  }

  let reply = "";

  try {
    if (bookingActive || wantsBooking(speech)) {
      bookingActive = true;
      if (!bookingStep) bookingStep = "people";
      reply = handleBooking(speech);
    } else {
      reply = await getGeneralReply(speech);
    }
  } catch (error) {
    console.error(error);
    reply = "Sorry, could you say that again?";
  }

  conversationHistory.push({ role: "user", content: speech });
  conversationHistory.push({ role: "assistant", content: reply });

  res.type("text/xml");
  res.send(sayAndGather(reply));
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
