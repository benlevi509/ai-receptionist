import { TIME_ZONE } from "./helpers.js";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50
};

function londonNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function validDate(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);
  return date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day
    ? date
    : null;
}

function dateToSheet(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function cleanSpeech(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\bp\.m\.?\b/g, "pm")
    .replace(/\ba\.m\.?\b/g, "am")
    .replace(/\bo['’]?clock\b/g, "oclock")
    .replace(/\s+/g, " ")
    .trim();
}

function wordNumber(token) {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

function minuteWords(text) {
  const trimmed = text.trim();
  if (trimmed === "quarter") return 15;
  if (trimmed === "half") return 30;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (NUMBER_WORDS[trimmed] != null) return NUMBER_WORDS[trimmed];

  const parts = trimmed.split(/[ -]+/).filter(Boolean);
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] >= 20 && NUMBER_WORDS[parts[1]] < 10) {
    return NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]];
  }
  return null;
}

function inferMeridiem(hour, text) {
  if (/\b(morning|breakfast)\b/.test(text)) return "AM";
  if (/\b(afternoon|evening|tonight|dinner|night)\b/.test(text)) return "PM";
  if (/\bam\b/.test(text)) return "AM";
  if (/\bpm\b/.test(text)) return "PM";

  if (hour >= 1 && hour <= 8) return "PM";
  return null;
}

function canonicalTime(hour, minute, meridiem) {
  hour = Number(hour);
  minute = Number(minute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }
  return `${hour}:${pad(minute)} ${meridiem}`;
}

function from24Hour(hour, minute) {
  hour = Number(hour);
  minute = Number(minute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  const meridiem = hour >= 12 ? "PM" : "AM";
  let twelveHour = hour % 12;
  if (twelveHour === 0) twelveHour = 12;
  return canonicalTime(twelveHour, minute, meridiem);
}

export function normaliseDate(value) {
  const text = cleanSpeech(value);
  if (!text) return null;
  const now = londonNow();

  const exact = text.match(/^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s*$/);
  if (exact) {
    const date = validDate(Number(exact[3]), Number(exact[2]) - 1, Number(exact[1]));
    return date ? dateToSheet(date) : null;
  }

  if (/\b(day after tomorrow|after tomorrow)\b/.test(text)) return dateToSheet(addDays(now, 2));
  if (/\b(tomorrow|tomorrow night|tomorrow evening)\b/.test(text)) return dateToSheet(addDays(now, 1));
  if (/\b(today|tonight|this evening|this afternoon)\b/.test(text)) return dateToSheet(now);

  for (const [name, target] of Object.entries(WEEKDAYS)) {
    if (!new RegExp(`\\b${name}\\b`).test(text)) continue;
    let daysAhead = (target - now.getDay() + 7) % 7;
    const saysNext = new RegExp(`\\bnext\\s+${name}\\b`).test(text);
    if (saysNext) {
      if (daysAhead === 0) daysAhead = 7;
      else daysAhead += 7;
    }
    return dateToSheet(addDays(now, daysAhead));
  }

  for (let monthIndex = 0; monthIndex < MONTHS.length; monthIndex++) {
    const month = MONTHS[monthIndex];
    const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${month}\\b`));
    const monthFirst = text.match(new RegExp(`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    const match = dayFirst || monthFirst;
    if (!match) continue;

    const day = Number(match[1]);
    let year = now.getFullYear();
    let date = validDate(year, monthIndex, day);
    if (!date) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date < today) date = validDate(year + 1, monthIndex, day);
    return date ? dateToSheet(date) : null;
  }

  const shortNumeric = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (shortNumeric) {
    const day = Number(shortNumeric[1]);
    const monthIndex = Number(shortNumeric[2]) - 1;
    let year = shortNumeric[3] ? Number(shortNumeric[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    let date = validDate(year, monthIndex, day);
    if (!date) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!shortNumeric[3] && date < today) date = validDate(year + 1, monthIndex, day);
    return date ? dateToSheet(date) : null;
  }

  return null;
}

export function normaliseTime(value) {
  const text = cleanSpeech(value);
  if (!text) return { time: null, ambiguous: false };

  if (/\bnoon\b/.test(text)) return { time: "12:00 PM", ambiguous: false };
  if (/\bmidnight\b/.test(text)) return { time: "12:00 AM", ambiguous: false };

  const explicit24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (explicit24 && !/\b(am|pm)\b/.test(text)) {
    return { time: from24Hour(explicit24[1], explicit24[2]), ambiguous: false };
  }

  const explicit12 = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  if (explicit12) {
    return { time: canonicalTime(Number(explicit12[1]), Number(explicit12[2] || 0), explicit12[3].toUpperCase()), ambiguous: false };
  }

  const relative = text.match(/\b(quarter|half|(?:\d{1,2}|[a-z]+(?:[ -][a-z]+)?))\s+(past|to)\s+(\d{1,2}|[a-z]+)\b/);
  if (relative) {
    const minutes = minuteWords(relative[1]);
    let hour = wordNumber(relative[3]);
    if (minutes != null && hour != null && hour >= 1 && hour <= 12 && minutes >= 0 && minutes <= 59) {
      let minute = minutes;
      if (relative[2] === "to") {
        minute = 60 - minutes;
        hour -= 1;
        if (hour === 0) hour = 12;
      }
      const meridiem = inferMeridiem(hour, text);
      if (!meridiem) return { time: null, ambiguous: true, candidate: `${hour}:${pad(minute)}` };
      return { time: canonicalTime(hour, minute, meridiem), ambiguous: false };
    }
  }

  const halfBare = text.match(/\bhalf\s+(\d{1,2}|[a-z]+)\b/);
  if (halfBare) {
    const hour = wordNumber(halfBare[1]);
    if (hour >= 1 && hour <= 12) {
      const meridiem = inferMeridiem(hour, text);
      if (!meridiem) return { time: null, ambiguous: true, candidate: `${hour}:30` };
      return { time: canonicalTime(hour, 30, meridiem), ambiguous: false };
    }
  }

  const ohMinute = text.match(/\b(\d{1,2}|[a-z]+)\s+oh\s+(\d{1,2}|[a-z]+)\b/);
  if (ohMinute) {
    const hour = wordNumber(ohMinute[1]);
    const minute = wordNumber(ohMinute[2]);
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 9) {
      const meridiem = inferMeridiem(hour, text);
      if (!meridiem) return { time: null, ambiguous: true, candidate: `${hour}:${pad(minute)}` };
      return { time: canonicalTime(hour, minute, meridiem), ambiguous: false };
    }
  }

  const twoPart = text.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(fifteen|thirty|forty five|forty-five|45)\b/);
  if (twoPart) {
    const hour = wordNumber(twoPart[1]);
    const minute = minuteWords(twoPart[2]);
    if (hour >= 1 && hour <= 12 && minute != null) {
      const meridiem = inferMeridiem(hour, text);
      if (!meridiem) return { time: null, ambiguous: true, candidate: `${hour}:${pad(minute)}` };
      return { time: canonicalTime(hour, minute, meridiem), ambiguous: false };
    }
  }

  const bare = text.match(/\b(?:at|for|around|about)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*oclock)?\b/);
  if (bare) {
    const hour = wordNumber(bare[1]);
    if (hour >= 1 && hour <= 12) {
      const meridiem = inferMeridiem(hour, text);
      if (!meridiem) return { time: null, ambiguous: true, candidate: `${hour}:00` };
      return { time: canonicalTime(hour, 0, meridiem), ambiguous: false };
    }
  }

  return { time: null, ambiguous: false };
}

export function normaliseName(value) {
  let cleaned = String(value || "")
    .replace(/\b(my name is|the name is|name is|put it under|book it under|reservation under|under the name|under|call me|it's|it is|i'm|i am)\b/gi, " ")
    .replace(/\b(can you|could you|would you|please|thanks|thank you|yeah|yes|yep|okay|ok|sure)\b/gi, " ")
    .replace(/[^a-zA-ZÀ-ÿ' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length > 60) return null;

  const words = cleaned.split(" ").filter(Boolean);
  if (!words.length || words.length > 4) return null;

  const banned = new Set([
    "can", "you", "could", "would", "please", "book", "booking", "table", "reservation",
    "name", "people", "person", "guests", "today", "tomorrow", "tonight", "time", "date",
    "yes", "yeah", "yep", "okay", "ok", "sure", "thanks", "thank", "hello", "hi"
  ]);

  if (words.every(word => banned.has(word.toLowerCase()))) return null;
  if (words.some(word => banned.has(word.toLowerCase()))) {
    cleaned = words.filter(word => !banned.has(word.toLowerCase())).join(" ").trim();
  }

  if (!cleaned) return null;

  return cleaned
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function normalisePeople(value) {
  if (Number.isInteger(value)) return value;
  const text = cleanSpeech(value);
  if (!text) return null;
  const digit = text.match(/\b\d{1,2}\b/);
  if (digit) return Number(digit[0]);
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (number <= 20 && new RegExp(`\\b${word}\\b`).test(text)) return number;
  }
  return null;
}
