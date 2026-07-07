import { state } from "./state.js";

export const TIME_ZONE = "Europe/London";
export const SLOT_MINUTES = 30;

export function randomChoice(options) {
  return options[Math.floor(Math.random() * options.length)];
}

export function titleCase(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function getLondonNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }));
}

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function getSuffix(day) {
  const n = Number(day);
  if (n >= 11 && n <= 13) return "th";
  if (n % 10 === 1) return "st";
  if (n % 10 === 2) return "nd";
  if (n % 10 === 3) return "rd";
  return "th";
}

export function formatDateForSheet(dateObj) {
  return `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
}

export function formatDateForSpeech(sheetDate) {
  const match = String(sheetDate || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return sheetDate;

  const day = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const year = Number(match[3]);

  const dateObj = new Date(year, monthIndex, day);
  const now = getLondonNow();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return `the ${day}${getSuffix(day)} of ${months[monthIndex]}`;
}

export function formatDisplayTime(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${pad(minutes)} ${suffix}`;
}

export function parseTimeToMinutes(timeText) {
  if (!timeText) return null;

  const match = String(timeText).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3].toLowerCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

export function roundUpToNextSlot(minutes) {
  return Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export function getTodayMinutes() {
  const now = getLondonNow();
  return now.getHours() * 60 + now.getMinutes();
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function formatDate(text) {
  const lower = String(text || "").toLowerCase();
  const now = getLondonNow();

  if (lower.includes("day after tomorrow") || lower.includes("after tomorrow")) {
    return formatDateForSheet(addDays(now, 2));
  }

  if (lower.includes("today")) return formatDateForSheet(now);

  if (lower.includes("tomorrow")) {
    return formatDateForSheet(addDays(now, 1));
  }

  const weekdays = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };

  for (const [dayName, dayNumber] of Object.entries(weekdays)) {
    if (lower.includes(dayName)) {
      const todayNumber = now.getDay();
      let daysAhead = dayNumber - todayNumber;

      if (lower.includes("next") || daysAhead <= 0) {
        daysAhead += 7;
      }

      return formatDateForSheet(addDays(now, daysAhead));
    }
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
      let dateObj = new Date(now.getFullYear(), i, day);

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dateObj < todayStart) dateObj.setFullYear(now.getFullYear() + 1);

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

function normalizeHour(hour) {
  const n = Number(hour);
  if (n < 1 || n > 12) return null;
  return n;
}

function buildTime(hour, minute = "00", meridiem = "PM") {
  const cleanHour = normalizeHour(hour);
  if (!cleanHour) return null;

  const cleanMinute = pad(Number(minute || 0));
  return `${cleanHour}:${cleanMinute} ${meridiem.toUpperCase()}`;
}

export function extractTime(text) {
  const lower = String(text || "").toLowerCase();

  const wordNumbers = {
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

  const explicitTime = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(pm|p\.m\.|am|a\.m\.)\b/i);
  if (explicitTime) {
    const meridiem = explicitTime[3].toLowerCase().startsWith("a") ? "AM" : "PM";
    return buildTime(explicitTime[1], explicitTime[2] || "00", meridiem);
  }

  for (const word in wordNumbers) {
    const regex = new RegExp(`\\b${word}\\s*(pm|p\\.m\\.|am|a\\.m\\.)\\b`, "i");
    const match = lower.match(regex);

    if (match) {
      const meridiem = match[1].toLowerCase().startsWith("a") ? "AM" : "PM";
      return buildTime(wordNumbers[word], "00", meridiem);
    }
  }

  const oclockNumber = lower.match(/\b(\d{1,2})\s*(o'clock|oclock|clock)\b/i);
  if (oclockNumber) {
    return buildTime(oclockNumber[1], "00", "PM");
  }

  for (const word in wordNumbers) {
    const regex = new RegExp(`\\b${word}\\s*(o'clock|oclock|clock)\\b`, "i");
    if (regex.test(lower)) return buildTime(wordNumbers[word], "00", "PM");
  }

  const casualTime = lower.match(/\b(?:for|at|around|about)\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (casualTime) {
    return buildTime(casualTime[1], casualTime[2] || "00", "PM");
  }

  for (const word in wordNumbers) {
    const regex = new RegExp(`\\b(?:for|at|around|about)\s+${word}\\b`, "i");
    if (regex.test(lower)) return buildTime(wordNumbers[word], "00", "PM");
  }

  if (
    state.bookingStep === "time" ||
    state.bookingStep === "correction" ||
    state.bookingStep === "correctTime" ||
    state.bookingStep === "availabilityTime"
  ) {
    const bareNumber = lower.match(/\b(\d{1,2})\b/);
    if (bareNumber) return buildTime(bareNumber[1], "00", "PM");

    for (const word in wordNumbers) {
      if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
        return buildTime(wordNumbers[word], "00", "PM");
      }
    }
  }

  return null;
}

export function cleanName(raw) {
  if (!raw) return null;

  let cleaned = String(raw).toLowerCase();

  cleaned = cleaned
    .replace(/\b(um+|umm+|uh+|erm+|er+|ah+|like|basically|actually|please|thanks|thank you|mate|yeah|yes|no|okay|ok)\b/gi, " ")
    .replace(/\b(my name is|the name is|name is|the name|my name|put it under|book it under|reservation under|under|call me|i am|i'm|im|it's|its|it is)\b/gi, " ")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const banned = new Set([
    "reservation", "booking", "table", "people", "person", "guests",
    "today", "tomorrow", "date", "time", "for", "at", "on", "is", "are",
    "menu", "close", "closing", "open", "opening"
  ]);

  let words = cleaned
    .split(" ")
    .filter(Boolean)
    .filter(w => !banned.has(w));

  if (!words.length) return null;

  words = words.slice(0, 2);

  return words.map(titleCase).join(" ");
}

export function extractName(text) {
  const lower = String(text || "").toLowerCase();

  const strongPatterns = [
    /(?:my name is|the name is|name is|put it under|book it under|reservation under|under|call me|i am|i'm|im)\s+([a-zA-Z][a-zA-Z\s'-]{0,40})/i,
    /([a-zA-Z][a-zA-Z\s'-]{0,40})\s+(?:is the name|for the name)/i
  ];

  for (const pattern of strongPatterns) {
    const match = lower.match(pattern);
    if (match && match[1]) return cleanName(match[1]);
  }

  if (
    state.bookingStep === "name" ||
    state.bookingStep === "confirmName" ||
    state.bookingStep === "correctName"
  ) {
    return cleanName(text);
  }

  return null;
}

export function extractPeople(text) {
  const lower = String(text || "").toLowerCase();

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
  if (peoplePhrase) return Number(peoplePhrase[1]);

  const explicitPeople = lower.match(/\b(\d+)\s*(people|persons|guests|of us)\b/);
  if (explicitPeople) return Number(explicitPeople[1]);

  for (const word in words) {
    const regex = new RegExp(`\\b(?:for|table for|party of)\\s+${word}\\b`, "i");
    if (regex.test(lower)) return words[word];
  }

  if (
    state.bookingStep === "people" ||
    state.bookingStep === "correction" ||
    state.bookingStep === "correctPeople"
  ) {
    const bareNumber = lower.match(/\b(\d+)\b/);
    if (bareNumber) return Number(bareNumber[1]);

    for (const word in words) {
      if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
        return words[word];
      }
    }
  }

  return null;
}

export function formatMenuForPrompt(menu) {
  if (!menu) return "No menu information has been provided.";

  return Object.entries(menu)
    .map(([section, items]) => `${section}: ${items.join(", ")}`)
    .join("\n");
}

export function formatOpeningHoursForPrompt(openingHours) {
  if (!openingHours) return "No opening hours have been provided.";

  return Object.entries(openingHours)
    .map(([day, hours]) => `${day}: ${hours}`)
    .join("\n");
}

export function formatCommonQuestionsForPrompt(commonQuestions) {
  if (!commonQuestions) return "No common question answers have been provided.";

  return Object.entries(commonQuestions)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join("\n");
}
