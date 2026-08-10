import businessConfig from "./businessConfig.js";
import { findAnyAvailableSlot, validateRequestedSlot } from "./availability.js";
import { saveBookingToSheet } from "./sheets.js";
import { formatDateForSpeech } from "./helpers.js";
import {
  normaliseDate,
  normaliseName,
  normalisePeople,
  normaliseTime
} from "./normalizers.js";

const bookingLocks = new Map();

function withBookingLock(key, operation) {
  const previous = bookingLocks.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  bookingLocks.set(key, next);
  return next.finally(() => {
    if (bookingLocks.get(key) === next) bookingLocks.delete(key);
  });
}

function bookingFingerprint({ people, date, time, name }) {
  return `${people}|${date}|${time}|${String(name).toLowerCase()}`;
}

function parseDateAndTime(args) {
  const date = normaliseDate(args.date);
  const parsedTime = normaliseTime(args.time);
  return { date, ...parsedTime };
}

export const realtimeTools = [
  {
    type: "function",
    name: "check_day_availability",
    description: "Use when the caller asks whether there is any space on a day but gives no time, for example 'do you have space today?'. Returns whether at least one future booking slot is available that day.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Requested day such as today, tomorrow, Friday or DD/MM/YYYY." }
      },
      required: ["date"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "check_availability",
    description: "Check a restaurant date and time before saying it is available. Accept natural British time wording. If the time is ambiguous between AM and PM, do not guess: ask the caller to clarify instead of calling this tool.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Requested date. DD/MM/YYYY is ideal, but natural wording such as today, tomorrow, tonight, this Friday or 18 August is accepted."
        },
        time: {
          type: "string",
          description: "Requested time. Natural wording is accepted, including 5 past 9, half nine, quarter to eight, 7:30 PM or 19:30."
        }
      },
      required: ["date", "time"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "create_booking",
    description: "Create the booking only after the caller has clearly agreed to one final summary containing party size, date, time and name. The server validates everything again and prevents duplicate saves from repeated tool calls.",
    parameters: {
      type: "object",
      properties: {
        people: { type: "integer", description: "Number of guests as an integer, for example 4." },
        date: { type: "string", description: "Final confirmed date." },
        time: { type: "string", description: "Final confirmed time." },
        name: { type: "string", description: "Final confirmed booking name." },
        notes: { type: "string", description: "Optional short note such as birthday, high chair or accessibility request." }
      },
      required: ["people", "date", "time", "name"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "end_call",
    description: "Use immediately when the caller clearly says goodbye, thanks bye, that's all, nothing else, or otherwise clearly ends the conversation. The server will end the phone call after your brief goodbye is played.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

export async function runRealtimeTool(name, args = {}, context = {}) {
  if (name === "end_call") {
    return { ok: true, action: "end_call" };
  }

  if (name === "check_day_availability") {
    const date = normaliseDate(args.date);
    if (!date) return { ok: false, reason: "invalid_date" };

    const firstAvailableTime = await findAnyAvailableSlot(date);
    return {
      ok: true,
      available: Boolean(firstAvailableTime),
      date,
      spokenDate: formatDateForSpeech(date),
      firstAvailableTime: firstAvailableTime || null
    };
  }

  if (name === "check_availability") {
    const { date, time, ambiguous, candidate } = parseDateAndTime(args);

    if (!date) {
      return { ok: false, reason: "invalid_date", message: "The date was not clear enough to check." };
    }

    if (ambiguous) {
      return {
        ok: false,
        reason: "ambiguous_time",
        candidate: candidate || null,
        message: "The clock time is understandable but AM or PM is unclear. Ask only that clarification."
      };
    }

    if (!time) {
      return { ok: false, reason: "invalid_time", message: "The time was not clear enough to check." };
    }

    const validation = await validateRequestedSlot(date, time);
    if (validation.ok) {
      return {
        ok: true,
        available: true,
        date,
        spokenDate: formatDateForSpeech(date),
        time
      };
    }

    return {
      ok: true,
      available: false,
      date,
      spokenDate: formatDateForSpeech(date),
      time,
      reason: validation.reason,
      suggestion: validation.suggestion || null
    };
  }

  if (name === "create_booking") {
    const maxPeople = businessConfig.bookingSettings?.maximumPartySize || 6;
    const people = normalisePeople(args.people);
    const { date, time, ambiguous, candidate } = parseDateAndTime(args);
    const nameForBooking = normaliseName(args.name);
    const notes = String(args.notes || "").trim().slice(0, 250);

    if (!Number.isInteger(people) || people < 1) return { ok: false, reason: "invalid_party_size" };
    if (people > maxPeople) return { ok: false, reason: "party_too_large", maximumPartySize: maxPeople };
    if (!date) return { ok: false, reason: "invalid_date" };
    if (ambiguous) return { ok: false, reason: "ambiguous_time", candidate: candidate || null };
    if (!time) return { ok: false, reason: "invalid_time" };
    if (!nameForBooking) return { ok: false, reason: "invalid_name" };

    const fingerprint = bookingFingerprint({ people, date, time, name: nameForBooking });
    if (context.savedBookings?.has(fingerprint)) return context.savedBookings.get(fingerprint);

    const lockKey = `${date}|${time}`;
    return withBookingLock(lockKey, async () => {
      if (context.savedBookings?.has(fingerprint)) return context.savedBookings.get(fingerprint);

      const validation = await validateRequestedSlot(date, time);
      if (!validation.ok) {
        return {
          ok: false,
          reason: validation.reason || "unavailable",
          suggestion: validation.suggestion || null
        };
      }

      const saved = await saveBookingToSheet({
        people,
        date,
        time,
        name: nameForBooking,
        phone: context.callerNumber || "",
        notes
      });

      if (!saved) return { ok: false, reason: "save_failed" };

      const result = {
        ok: true,
        confirmed: true,
        booking: {
          people,
          date,
          spokenDate: formatDateForSpeech(date),
          time,
          name: nameForBooking
        }
      };

      context.savedBookings?.set(fingerprint, result);
      return result;
    });
  }

  return { ok: false, reason: "unknown_tool" };
}
