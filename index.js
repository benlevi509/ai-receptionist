import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { google } from "googleapis";
import fs from "fs";
import businessConfig from "./businessConfig.js";

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
let pendingName = null;

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

  const peoplePhrase = lower.match(/\b(?:for|table for|party of)\s+(\d+)\b/);
  if (peoplePhrase) return `${peoplePhrase[1]} people`;

  const explicitPeople = lower.match(/\b(\d+)\s*(people|persons|guests|of us)\b/);
  if (explicitPeople) return `${explicitPeople[1]} people`;

  if (bookingStep === "people") {
    const bareNumber = lower.match(/\b(\d+)\b/);
    if (bareNumber) return `${bareNumber[1]} people`;

    for (const word in words) {
      if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
        return `${words[word]} people`;
      }
    }
  }

  for (const word in words) {
    const regex = new RegExp(`\\b(?:for|table for|party of)\\s+${word}\\b`, "i");
    if (regex.test(lower)) return `${words[word]} people`;
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

function cleanName(raw) {
  if (!raw) return null;

  let cleaned = raw.toLowerCase();

  cleaned = cleaned
    .replace(/\b(umm|um|uh|erm|er)\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/\bthank you\b/gi, "")
    .replace(/\bthanks\b/gi, "")
    .replace(/\bjust\b/gi, "")
    .replace(/[.,!?]/g, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (!words.length) return null;

  return words.map(titleCase).join(" ");
}

function extractName(text) {
  const patterns = [
    /(?:my name is|name is|the name is)\s+(.+)/i,
    /(?:put it under|book it under|reservation under|under)\s+(.+)/i,
    /(?:it's|its|it is)\s+(.+)/i,
    /(.+?)\s+(?:is the name|for the name)/i,
    /(?:no|nope),?\s*(?:it's|its|it is|just)?\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return cleanName(match[1]);
  }

  if (bookingStep === "name" || bookingStep === "confirmName") {
    return cleanName(text);
  }

  return null;
}

function isEndingPhrase(text) {
  const lower = text.toLowerCase();

  return [
    "bye",
    "goodbye",
    "that's all",
    "thats all",
    "nothing else",
    "no thanks",
    "no thank you",
    "nope that's all",
    "nope thats all",
    "no that's it",
    "no thats it",
    "all good",
    "that's everything",
    "thats everything",
    "that's it",
    "thats it",
    "thanks bye"
  ].some(p => lower.includes(p));
}

function isAiGoodbye(text) {
  const lower = text.toLowerCase();

  return [
    "goodbye",
    "bye",
    "have a wonderful",
    "have a great day",
    "have a lovely day",
    "have a nice day",
    "thanks for calling",
    "thank you for calling"
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

function asksAvailableDates(text) {
  const lower = text.toLowerCase();

  return [
    "what dates do you have",
    "what dates are available",
    "what days do you have",
    "what days are available",
    "when are you available",
    "what availability do you have"
  ].some(p => lower.includes(p));
}

function asksAvailableTimes(text) {
  const lower = text.toLowerCase();

  return [
    "what times do you have",
    "what times are available",
    "what time slots",
    "what slots do you have",
    "what availability do you have"
  ].some(p => lower.includes(p));
}

function confirms(text) {
  const lower = text.toLowerCase();

  return [
    "yes",
    "yeah",
    "yep",
    "correct",
    "that's right",
    "thats right",
    "that's fine",
    "thats fine",
    "perfect",
    "go ahead",
    "book it",
    "put it down",
    "that works",
    "sounds good"
  ].some(p => lower.includes(p));
}

function denies(text) {
  const lower = text.toLowerCase();

  return [
    "no",
    "nope",
    "nah",
    "not right",
    "wrong",
    "incorrect"
  ].some(p => lower.includes(p));
}

function formatMenuForPrompt(menu) {
  if (!menu) return "No menu information has been provided.";

  return Object.entries(menu)
    .map(([section, items]) => `${section}: ${items.join(", ")}`)
    .join("\n");
}

function formatOpeningHoursForPrompt(openingHours) {
  if (!openingHours) return "No opening hours have been provided.";

  return Object.entries(openingHours)
    .map(([day, hours]) => `${day}: ${hours}`)
    .join("\n");
}

function formatCommonQuestionsForPrompt(commonQuestions) {
  if (!commonQuestions) return "No common question answers have been provided.";

  return Object.entries(commonQuestions)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join("\n");
}

/* ---------- GOOGLE SHEETS ---------- */

function getGoogleCredentialsPath() {
  if (fs.existsSync("/etc/secrets/google-credentials.json")) {
    return "/etc/secrets/google-credentials.json";
  }

  return "google-credentials.json";
}

async function saveBookingToSheet(bookingData) {
  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error("Missing GOOGLE_SHEET_ID environment variable.");
      return;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: getGoogleCredentialsPath(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:G",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }),
          bookingData.name || "",
          bookingData.people || "",
          bookingData.date || "",
          bookingData.time || "",
          bookingData.phone || "",
          bookingData.notes || ""
        ]]
      }
    });

    console.log("Booking saved to Google Sheets.");
  } catch (error) {
    console.error("Failed to save booking to Google Sheets:", error);
  }
}

/* ---------- TWILIO ---------- */

function sayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Gather input="speech" timeout="10" speechTimeout="1.2" action="/process-speech" method="POST"></Gather>
<Say voice="Polly.Brian" language="en-GB">Sorry, I didn't catch that.</Say>
<Gather input="speech" timeout="20" speechTimeout="1.2" action="/process-speech" method="POST"></Gather>
<Say voice="Polly.Brian" language="en-GB">Thanks for calling. Have a nice day.</Say>
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
    temperature: 0.35,
    max_tokens: 35,
    messages: [
      {
        role: "system",
        content: `
You are a natural phone receptionist for ${businessConfig.businessName}.
Business type: ${businessConfig.businessType}.
Tone: ${businessConfig.tone}.

Address:
${businessConfig.address}

Phone number:
${businessConfig.phoneNumber}

Opening hours:
${formatOpeningHoursForPrompt(businessConfig.openingHours)}

Menu:
${formatMenuForPrompt(businessConfig.menu)}

Common questions:
${formatCommonQuestionsForPrompt(businessConfig.commonQuestions)}

Rules:
Maximum 12 words.
Sound relaxed, clear, and human.
Do not overuse words like great, perfect, lovely, sure, or no problem.
Never say "would you like to know more?"
Never say "enjoy your time at ${businessConfig.businessName}" unless a booking is fully confirmed.
After helping, ask briefly if they need anything else.
Only mention reservations if it fits naturally.
Ask one question at a time.
Never mention AI.
Do not start every sentence with okay.
If you do not know something, say: "${businessConfig.fallback}"
`
      },
      ...conversationHistory.slice(-4),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}

/* ---------- BOOKING ---------- */

async function handleBooking(speech) {
  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);
  const availabilityQuestion = asksAvailability(speech);
  const availableDatesQuestion = asksAvailableDates(speech);
  const availableTimesQuestion = asksAvailableTimes(speech);

  if (bookingStep === "confirmName") {
    const correctedName = extractName(speech);

    if (confirms(speech)) {
      booking.name = pendingName;

      const completedBooking = { ...booking };
      await saveBookingToSheet(completedBooking);

      pendingName = null;
      bookingActive = false;
      bookingStep = null;

      return randomChoice([
        `That's booked for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can assist you with?`,
        `All set. That's for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can assist you with?`,
        `Your reservation is booked for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can assist you with?`
      ]);
    }

    if (denies(speech) && correctedName) {
      pendingName = correctedName;
      return `I heard ${pendingName}. Is that right?`;
    }

    if (denies(speech)) {
      bookingStep = "name";
      pendingName = null;
      return randomChoice([
        "That's fine. What name should I put the reservation under?",
        "Of course. Who should I put the booking under?",
        "Alright. What name is best for the reservation?"
      ]);
    }

    if (correctedName) {
      pendingName = correctedName;
      return `I heard ${pendingName}. Is that right?`;
    }

    return "Sorry, I didn't catch the name. Could you repeat it?";
  }

  if (people && !booking.people) booking.people = people;
  if (date && !booking.date) booking.date = date;

  if (pendingTime && confirms(speech)) {
    booking.time = pendingTime;
    pendingTime = null;
  }

  if (time && !booking.time) {
    if (availabilityQuestion) {
      pendingTime = time;
      return randomChoice([
        `We should have space at ${time}. Shall I book that for you?`,
        `That should be fine for ${time}. Would you like me to reserve it?`,
        `Yes, ${time} should work. Should I put that down for you?`
      ]);
    }

    booking.time = time;
  }

  if (!booking.people) {
    bookingStep = "people";

    if (availableDatesQuestion || availableTimesQuestion) {
      return randomChoice([
        "I can check that. How many people is the reservation for?",
        "Of course. How many people is the booking for?",
        "Certainly. How many guests is the reservation for?"
      ]);
    }

    return randomChoice([
      "Of course. How many people is the reservation for?",
      "Certainly. How many people is the booking for?",
      "How many people should I make the reservation for?",
      "How many guests is the booking for?",
      "And how many people is the reservation for?"
    ]);
  }

  if (!booking.date) {
    bookingStep = "date";

    if (availableDatesQuestion) {
      return randomChoice([
        "We usually have availability across opening days. Which date suits you?",
        "There should be a few options. What date were you thinking?",
        "I can check that for you. Which date would you like?"
      ]);
    }

    if (availableTimesQuestion) {
      return randomChoice([
        "I can check times after I know the date. What date were you thinking?",
        "Sure, let me get the date first. Which day would you like?",
        "Alright. What date should I check for?"
      ]);
    }

    return randomChoice([
      "Great, and what date were you thinking?",
      "Perfect. Which day would you like to book?",
      "Alright, what date should I put you down for?",
      "Brilliant, and what date works best for you?",
      "Thanks. What date would you like the reservation for?"
    ]);
  }

  if (!booking.time) {
    bookingStep = "time";

    if (availableTimesQuestion || availabilityQuestion) {
      const earliest = businessConfig.bookingSettings?.earliestBookingTime || "opening";
      const latest = businessConfig.bookingSettings?.latestBookingTime || "closing";
      return randomChoice([
        `Usually between ${earliest} and ${latest}. What time should I check?`,
        `We usually take bookings between ${earliest} and ${latest}. What time were you thinking?`,
        `It is normally between ${earliest} and ${latest}. What time should the reservation be?`
      ]);
    }

    return randomChoice([
      "Perfect, and what time should the reservation be?",
      "Great. What time should I book it for?",
      "And what time would you like the booking for?",
      "Lovely, what time were you thinking?",
      "Brilliant. What time should I put down?"
    ]);
  }

  if (!booking.name) {
    bookingStep = "name";

    const name = extractName(speech);

    if (name) {
      pendingName = name;
      bookingStep = "confirmName";
      return `I heard ${pendingName}. Is that right?`;
    }

    return randomChoice([
      "Great, one last question. What name should I put the reservation under?",
      "Perfect, and who should I make the reservation under?",
      "Brilliant. What name is the booking under?",
      "And what should I put the reservation under?",
      "Amazing, who am I booking this under?",
      "Thanks, and what name should I put down?"
    ]);
  }

  const completedBooking = { ...booking };
  await saveBookingToSheet(completedBooking);

  bookingActive = false;
  bookingStep = null;
  pendingTime = null;
  pendingName = null;

  return randomChoice([
    `That's booked for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can assist you with?`,
    `All set. That's for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can assist you with?`,
    `Your reservation is booked for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is there anything else I can assist you with?`
  ]);
}

/* ---------- ROUTES ---------- */

app.get("/test-ai", (req, res) => {
  res.send(`${businessConfig.businessName} AI receptionist is running.`);
});

app.post("/voice", (req, res) => {
  conversationHistory = [];
  booking = {};
  bookingActive = false;
  bookingStep = null;
  pendingTime = null;
  pendingName = null;

  res.type("text/xml");
  res.send(sayAndGather(businessConfig.greeting));
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
    res.send(sayAndHangup("Okay, have a nice day. Goodbye."));
    return;
  }

  let reply = "";

  try {
    if (bookingActive || wantsBooking(speech)) {
      bookingActive = true;
      if (!bookingStep) bookingStep = "people";
      reply = await handleBooking(speech);
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

  if (isAiGoodbye(reply)) {
    res.send(sayAndHangup(reply));
  } else {
    res.send(sayAndGather(reply));
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`${businessConfig.businessName} server running on port ${PORT}`);
});
