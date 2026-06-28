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

/* ---------- HELPERS ---------- */

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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

function getSuffix(day) {
  const n = Number(day);
  if (n >= 11 && n <= 13) return "th";
  if (n % 10 === 1) return "st";
  if (n % 10 === 2) return "nd";
  if (n % 10 === 3) return "rd";
  return "th";
}

function extractPeople(text) {
  const lower = text.toLowerCase();

  const numberMatch = lower.match(/\b(\d+)\b/);
  if (numberMatch) return `${numberMatch[1]} people`;

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

  for (const word in words) {
    if (lower.includes(word)) return `${words[word]} people`;
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

  const timeMatch = lower.match(/\b(\d{1,2})(:\d{2})?\s*(pm|am)?\b/);

  if (timeMatch) {
    let time = timeMatch[1] + (timeMatch[2] || "");
    time += timeMatch[3] || "pm";
    return time;
  }

  return null;
}

function extractName(text) {
  let cleaned = text
    .replace(/it's under/i, "")
    .replace(/its under/i, "")
    .replace(/under/i, "")
    .replace(/my name is/i, "")
    .replace(/the name is/i, "")
    .replace(/name is/i, "")
    .trim();

  return cleaned || null;
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
    "table"
  ].some(p => lower.includes(p));
}

/* ---------- TWILIO ---------- */

function sayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>

<Gather input="speech" timeout="10" speechTimeout="1.2" action="/process-speech" method="POST">
</Gather>

<Say voice="Polly.Brian" language="en-GB">Sorry, I didn't catch that.</Say>

<Gather input="speech" timeout="20" speechTimeout="1.2" action="/process-speech" method="POST">
</Gather>

<Say voice="Polly.Brian" language="en-GB">Thanks for calling. Have a great day.</Say>
<Hangup/>
</Response>
`;
}

function sayAndHangup(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
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
Do not sound posh, creepy, or robotic.
Never say "would you like to know more?"
Do not always push reservations.
Only mention reservations if it fits naturally.
Ask one question at a time.
Never mention AI.
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

  if (bookingStep === "people" && people) {
    booking.people = people;
  }

  if (bookingStep === "date" && date) {
    booking.date = date;
  }

  if (bookingStep === "time" && time) {
    booking.time = time;
  }

  if (bookingStep === "name") {
    booking.name = extractName(speech);
  }

  if (!booking.people) {
    bookingStep = "people";
    return "Sure, how many people is the table for?";
  }

  if (!booking.date) {
    bookingStep = "date";
    return "What date would you like?";
  }

  if (!booking.time) {
    bookingStep = "time";
    return `Yes, ${booking.date} should be fine. What time?`;
  }

  if (!booking.name) {
    bookingStep = "name";
    return "What name should I put it under?";
  }

  bookingActive = false;
  bookingStep = null;

  return `Perfect, table for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Anything else?`;
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
    res.send(sayAndHangup("Perfect, thanks for calling. Have a great day."));
    return;
  }

  let reply = "";

  try {
    if (bookingActive || wantsBooking(speech)) {
      bookingActive = true;

      if (!bookingStep) {
        bookingStep = "people";
      }

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
