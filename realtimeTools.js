import businessConfig from "./businessConfig.js";
import { validateRequestedSlot } from "./availability.js";
import { saveBookingToSheet } from "./sheets.js";
import { extractTime, formatDate, formatDateForSpeech } from "./helpers.js";

function normaliseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) return raw;
  return formatDate(raw);
}

function normaliseTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(raw)) {
    const [clock, meridiem] = raw.split(/\s+/);
    return `${clock} ${meridiem.toUpperCase()}`;
  }
  return extractTime(`at ${raw}`);
}

export const realtimeTools = [
  {
    type: "function",
    name: "check_availability",
    description: "Check restaurant table availability before promising a time. Use whenever the caller asks whether a date/time is available or before confirming a booking.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Requested date, preferably DD/MM/YYYY, or natural wording such as tomorrow or next Friday." },
        time: { type: "string", description: "Requested time, for example 7 PM or 7:30 PM." }
      },
      required: ["date", "time"]
    }
  },
  {
    type: "function",
    name: "create_booking",
    description: "Save a restaurant booking only after the caller has clearly confirmed the final party size, date, time and name. This tool validates availability again before saving.",
    parameters: {
      type: "object",
      properties: {
        people: { type: "integer", description: "Number of guests." },
        date: { type: "string", description: "Final confirmed date, preferably DD/MM/YYYY, or natural wording." },
        time: { type: "string", description: "Final confirmed time." },
        name: { type: "string", description: "Name for the booking." },
        notes: { type: "string", description: "Optional short note such as birthday or accessibility request." }
      },
      required: ["people", "date", "time", "name"]
    }
  }
];

export async function runRealtimeTool(name, args = {}, context = {}) {
  if (name === "check_availability") {
    const date = normaliseDate(args.date);
    const time = normaliseTime(args.time);

    if (!date || !time) {
      return { ok: false, reason: "invalid_date_or_time", message: "I need a clear date and time to check that." };
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
    const people = Number(args.people);
    const date = normaliseDate(args.date);
    const time = normaliseTime(args.time);
    const bookingName = String(args.name || "").trim();

    if (!Number.isInteger(people) || people < 1) {
      return { ok: false, reason: "invalid_party_size" };
    }

    if (people > maxPeople) {
      return { ok: false, reason: "party_too_large", maximumPartySize: maxPeople };
    }

    if (!date || !time || !bookingName) {
      return { ok: false, reason: "missing_booking_details" };
    }

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
      name: bookingName,
      phone: context.callerNumber || "",
      notes: String(args.notes || "").trim()
    });

    if (!saved) return { ok: false, reason: "save_failed" };

    return {
      ok: true,
      confirmed: true,
      booking: {
        people,
        date,
        spokenDate: formatDateForSpeech(date),
        time,
        name: bookingName
      }
    };
  }

  return { ok: false, reason: "unknown_tool" };
}
