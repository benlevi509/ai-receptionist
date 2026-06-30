import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { google } from "googleapis";
import fs from "fs";
import businessConfig from "./businessConfig.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let conversationHistory = [];
let booking = {};
let bookingActive = false;
let bookingStep = null;
let pendingTime = null;
let pendingName = null;

const TIME_ZONE = "Europe/London";
const SHEET_RANGE = "Sheet1!A:G";
const SLOT_MINUTES = 30;

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

function getLondonNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateForSheet(dateObj) {
  return `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
}

function formatDisplayTime(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${pad(minutes)} ${suffix}`;
}

function parseTimeToMinutes(timeText) {
  if (!timeText) return null;

  const lower = String(timeText).toLowerCase().trim();
  const match = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3].toLowerCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function roundUpToNextSlot(minutes) {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function getTodayMinutes() {
  const now = getLondonNow();
  return now.getHours() * 60 + now.getMinutes();
}

function getGoogleCredentialsPath() {
  if (fs.existsSync("/etc/secrets/google-credentials.json")) {
    return "/etc/secrets/google-credentials.json";
  }
  return "google-credentials.json";
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: getGoogleCredentialsPath(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

/* ---------- DATE / TIME EXTRACTION ---------- */

function formatDate(text) {
  const lower = text.toLowerCase();
  const now = getLondonNow();

  if (lower.includes("today")) {
    return formatDateForSheet(now);
  }

  if (lower.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateForSheet(tomorrow);
  }

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const regex = new RegExp(`(\\d{1,2})(st|nd|rd|th)?\\s*(of\\s+)?${month}`, "i");
    const match = lower.match(regex);

    if (match) {
      const day = Number(match[1]);
      const year = now.getFullYear();

      const dateObj = new Date(year, i, day);

      if (dateObj < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        dateObj.setFullYear(year + 1);
      }

      return formatDateForSheet(dateObj);
    }
  }

  const numericDate = lower.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]) - 1;
    let year = numericDate[3] ? Number(numericDate[3]) : now.getFullYear();
    if (year < 100) year += 2000;

    return formatDateForSheet(new Date(year, month, day));
  }

  return null;
}

function extractTime(text) {
  const lower = text.toLowerCase();

  const wordNumbers = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
  };

  const halfTimes = {
    "half one": "1:30 PM",
    "half two": "2:30 PM",
    "half three": "3:30 PM",
    "half four": "4:30 PM",
    "half five": "5:30 PM",
    "half six": "6:30 PM",
    "half seven": "7:30 PM",
    "half eight": "8:30 PM",
    "half nine": "9:30 PM",
    "half ten": "10:30 PM",
    "half eleven": "11:30 PM",
    "half twelve": "12:30 PM"
  };

  for (const phrase in halfTimes) {
    if (lower.includes(phrase)) return halfTimes[phrase];
  }

  const explicitTime = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pm|am)\b/i);
  if (explicitTime) {
    return `${explicitTime[1]}:${explicitTime[2] || "00"} ${explicitTime[3].toUpperCase()}`;
  }

  const oclockNumber = lower.match(/\b(\d{1,2})\s*(o'clock|oclock|clock)\b/i);
  if (oclockNumber) {
    const hour = Number(oclockNumber[1]);
    return `${hour}:00 PM`;
  }

  for (const word in wordNumbers) {
    const regex = new RegExp(`\\b${word}\\s*(o'clock|oclock|clock)\\b`, "i");
    if (regex.test(lower)) {
      return `${wordNumbers[word]}:00 PM`;
    }
  }

  const casualTime = lower.match(/\b(?:for|at|around|about)\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (casualTime) {
    return `${casualTime[1]}:${casualTime[2] || "00"} PM`;
  }

  if (bookingStep === "time" || bookingStep === "correction") {
    const bareNumber = lower.match(/\b(\d{1,2})\b/);
    if (bareNumber) return `${bareNumber[1]}:00 PM`;
  }

  return null;
}

/* ---------- SMART NAME CLEANING ---------- */

function cleanName(raw) {
  if (!raw) return null;

  let cleaned = raw.toLowerCase();

  cleaned = cleaned
    .replace(/\b(um+|umm+|uh+|erm+|er+|ah+|like|basically|actually|please|thanks|thank you|mate)\b/gi, " ")
    .replace(/\b(my name is|name is|the name is|it is|it's|its|put it under|book it under|reservation under|under|call me|i am|i'm|im)\b/gi, " ")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const badWords = ["reservation", "booking", "table", "people", "person", "today", "tomorrow"];
  let words = cleaned.split(" ").filter(Boolean).filter(w => !badWords.includes(w));

  if (!words.length) return null;

  words = words.slice(0, 3);

  return words.map(titleCase).join(" ");
}

function extractName(text) {
  const patterns = [
    /(?:my name is|name is|the name is|put it under|book it under|reservation under|under|call me|i am|i'm|im)\s+(.+)/i,
    /(.+?)\s+(?:is the name|for the name)/i
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

/* ---------- PEOPLE ---------- */

function extractPeople(text) {
  const lower = text.toLowerCase();

  const words = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
  };

  const peoplePhrase = lower.match(/\b(?:for|table for|party of)\s+(\d+)\b/);
  if (peoplePhrase) return `${peoplePhrase[1]} people`;

  const explicitPeople = lower.match(/\b(\d+)\s*(people|persons|guests|of us)\b/);
  if (explicitPeople) return `${explicitPeople[1]} people`;

  if (bookingStep === "people" || bookingStep === "correction") {
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

/* ---------- AVAILABILITY ---------- */

async function getExistingBookings() {
  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE
    });

    const rows = response.data.values || [];
    return rows.slice(1).map(row => ({
      date: row[3] || "",
      time: row[4] || ""
    }));
  } catch (error) {
    console.error("Failed to read bookings:", error);
    return [];
  }
}

async function isSlotTaken(date, time) {
  const bookings = await getExistingBookings();
  const requestedMinutes = parseTimeToMinutes(time);

  return bookings.some(b => {
    if (b.date !== date) return false;
    const existingMinutes = parseTimeToMinutes(b.time);
    return existingMinutes === requestedMinutes;
  });
}

async function findNextAvailableSlot(date, requestedTime) {
  let minutes = parseTimeToMinutes(requestedTime);
  if (minutes === null) return null;

  minutes = roundUpToNextSlot(minutes);

  const now = getLondonNow();
  const today = formatDateForSheet(now);

  if (date === today && minutes <= getTodayMinutes()) {
    minutes = roundUpToNextSlot(getTodayMinutes() + 1);
  }

  const latest = parseTimeToMinutes(
    businessConfig.bookingSettings?.latestBookingTime || "10:00 PM"
  ) || 22 * 60;

  while (minutes <= latest) {
    const displayTime = formatDisplayTime(minutes);
    const taken = await isSlotTaken(date, displayTime);

    if (!taken) return displayTime;

    minutes += SLOT_MINUTES;
  }

  return null;
}

async function validateRequestedSlot(date, time) {
  const requestedMinutes = parseTimeToMinutes(time);

  if (requestedMinutes === null) {
    return {
      ok: false,
      reason: "invalid",
      suggestion: null
    };
  }

  if (requestedMinutes % SLOT_MINUTES !== 0) {
    const suggestion = await findNextAvailableSlot(date, time);
    return {
      ok: false,
      reason: "not_half_hour",
      suggestion
    };
  }

  const today = formatDateForSheet(getLondonNow());

  if (date === today && requestedMinutes <= getTodayMinutes()) {
    const suggestion = await findNextAvailableSlot(date, time);
    return {
      ok: false,
      reason: "past",
      suggestion
    };
  }

  const taken = await isSlotTaken(date, time);

  if (taken) {
    const suggestion = await findNextAvailableSlot(date, time);
    return {
      ok: false,
      reason: "taken",
      suggestion
    };
  }

  return {
    ok: true,
    reason: null,
    suggestion: null
  };
}

/* ---------- INTENT HELPERS ---------- */

function isEndingPhrase(text) {
  const lower = text.toLowerCase();
  return [
    "bye", "goodbye", "that's all", "thats all", "nothing else",
    "no thanks", "no thank you", "nope that's all", "nope thats all",
    "no that's it", "no thats it", "all good", "that's everything",
    "thats everything", "that's it", "thats it", "thanks bye"
  ].some(p => lower.includes(p));
}

function isAiGoodbye(text) {
  const lower = text.toLowerCase();
  return [
    "goodbye", "bye", "have a wonderful", "have a great day",
    "have a lovely day", "have a nice day", "thanks for calling",
    "thank you for calling"
  ].some(p => lower.includes(p));
}

function wantsBooking(text) {
  const lower = text.toLowerCase();
  return ["book", "booking", "reservation", "reserve", "table", "space", "availability"]
    .some(p => lower.includes(p));
}

function confirms(text) {
  const lower = text.toLowerCase();
  return [
    "yes", "yeah", "yep", "correct", "that's right", "thats right",
    "that's fine", "thats fine", "perfect", "go ahead", "book it",
    "put it down", "that works", "sounds good"
  ].some(p => lower.includes(p));
}

function denies(text) {
  const lower = text.toLowerCase();
  return ["no", "nope", "nah", "not right", "wrong", "incorrect"]
    .some(p => lower.includes(p));
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

function bookingSummaryQuestion() {
  return `Just to confirm, that's a reservation for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Is that all correct?`;
}

/* ---------- GOOGLE SHEETS SAVE ---------- */

async function saveBookingToSheet(bookingData) {
  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error("Missing GOOGLE_SHEET_ID environment variable.");
      return;
    }

    const sheets = await getSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-GB", { timeZone: TIME_ZONE }),
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
  const now = getLondonNow();

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

Current London date and time:
${now.toString()}

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
Never mention AI.
Ask one question at a time.
If you do not know something, say: "${businessConfig.fallback}"
`
      },
      ...conversationHistory.slice(-4),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}

/* ---------- BOOKING FLOW ---------- */

async function handleBooking(speech) {
  const startingStep = bookingStep;

  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);

  if (startingStep === "confirmDetails") {
    if (confirms(speech)) {
      const completedBooking = { ...booking };
      await saveBookingToSheet(completedBooking);

      bookingActive = false;
      bookingStep = null;
      pendingTime = null;
      pendingName = null;

      return `All set. You're booked for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Anything else?`;
    }

    if (denies(speech)) {
      bookingStep = "correction";
      return "Of course. Which part is wrong: people, date, time, or name?";
    }

    return "Sorry, is that booking correct?";
  }

  if (startingStep === "correction") {
    const lower = speech.toLowerCase();
    const correctedPeople = extractPeople(speech);
    const correctedDate = formatDate(speech);
    const correctedTime = extractTime(speech);
    const correctedName = extractName(speech);

    if (lower.includes("people") || lower.includes("guest") || correctedPeople) {
      booking.people = correctedPeople;
      bookingStep = "confirmDetails";
      return bookingSummaryQuestion();
    }

    if (lower.includes("date") || lower.includes("day") || correctedDate) {
      booking.date = correctedDate;
      booking.time = null;
      bookingStep = "time";
      return "No problem. What time should I check for that date?";
    }

    if (lower.includes("time") || correctedTime) {
      const validation = await validateRequestedSlot(booking.date, correctedTime);

      if (!validation.ok) {
        if (validation.suggestion) {
          pendingTime = validation.suggestion;
          bookingStep = "confirmSuggestedTime";
          return `${correctedTime} isn't available. I can do ${validation.suggestion}. Shall I book that?`;
        }

        return "Sorry, I can't find a suitable slot for that time.";
      }

      booking.time = correctedTime;
      bookingStep = "confirmDetails";
      return bookingSummaryQuestion();
    }

    if (lower.includes("name") || lower.includes("under") || correctedName) {
      booking.name = null;
      pendingName = null;
      bookingStep = "name";
      return "No worries. What name should I put it under?";
    }

    return "Which part should I change: people, date, time, or name?";
  }

  if (startingStep === "confirmSuggestedTime") {
    if (confirms(speech)) {
      booking.time = pendingTime;
      pendingTime = null;
      bookingStep = booking.name ? "confirmDetails" : "name";

      if (booking.name) return bookingSummaryQuestion();
      return "Great. What name should I put the reservation under?";
    }

    if (denies(speech)) {
      pendingTime = null;
      bookingStep = "time";
      return "No problem. What other time would you like?";
    }

    return "Sorry, should I book that suggested time?";
  }

  if (startingStep === "confirmName") {
    const correctedName = extractName(speech);

    if (confirms(speech)) {
      booking.name = pendingName;
      pendingName = null;
      bookingStep = "confirmDetails";
      return bookingSummaryQuestion();
    }

    if (denies(speech)) {
      bookingStep = "name";
      pendingName = null;
      return "No problem. What name should I put it under?";
    }

    if (correctedName) {
      pendingName = correctedName;
      return `I heard ${pendingName}. Is that right?`;
    }

    return "Sorry, what name should I put the reservation under?";
  }

  if (startingStep === "name") {
    const name = extractName(speech);

    if (name) {
      pendingName = name;
      bookingStep = "confirmName";
      return `I heard ${pendingName}. Is that right?`;
    }

    return "Sorry, what name should I put the reservation under?";
  }

  if (people && !booking.people) booking.people = people;

  if (!booking.people) {
    bookingStep = "people";
    return "Of course. How many people is the reservation for?";
  }

  if (date && !booking.date) booking.date = date;

  if (!booking.date) {
    bookingStep = "date";
    return "Great. What date would you like the reservation for?";
  }

  if (time && !booking.time) {
    const validation = await validateRequestedSlot(booking.date, time);

    if (!validation.ok) {
      if (validation.suggestion) {
        pendingTime = validation.suggestion;
        bookingStep = "confirmSuggestedTime";

        if (validation.reason === "past") {
          return `${time} has already passed. I can do ${validation.suggestion}. Shall I book that?`;
        }

        if (validation.reason === "not_half_hour") {
          return `Bookings are every 30 minutes. I can do ${validation.suggestion}. Shall I book that?`;
        }

        if (validation.reason === "taken") {
          return `${time} is already booked. I can do ${validation.suggestion}. Shall I book that?`;
        }

        return `I can do ${validation.suggestion}. Shall I book that?`;
      }

      return "Sorry, I can't find a suitable available slot for that time.";
    }

    booking.time = time;
  }

  if (!booking.time) {
    bookingStep = "time";
    return "Perfect. What time should I book it for?";
  }

  if (!booking.name) {
    bookingStep = "name";
    return "Great, one last question. What name should I put it under?";
  }

  bookingStep = "confirmDetails";
  return bookingSummaryQuestion();
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
    reply = "Sorry, something went wrong. Could you repeat that?";
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
