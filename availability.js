import businessConfig from "./businessConfig.js";
import { getExistingBookings } from "./sheets.js";
import {
  formatDateForSheet,
  formatDisplayTime,
  getLondonNow,
  getTodayMinutes,
  parseTimeToMinutes,
  roundUpToNextSlot,
  SLOT_MINUTES
} from "./helpers.js";

const OPENING_MINUTES = 9 * 60;
const CLOSING_MINUTES = 23 * 60;

function isWithinOpeningHours(minutes) {
  return minutes >= OPENING_MINUTES && minutes <= CLOSING_MINUTES;
}

export async function isSlotTaken(date, time) {
  const bookings = await getExistingBookings();
  const requestedMinutes = parseTimeToMinutes(time);

  return bookings.some(b => {
    if (b.date !== date) return false;

    const existingMinutes = parseTimeToMinutes(b.time);
    return existingMinutes === requestedMinutes;
  });
}

export async function findNextAvailableSlot(date, requestedTime) {
  let minutes = parseTimeToMinutes(requestedTime);
  if (minutes === null) return null;

  minutes = roundUpToNextSlot(minutes);

  const today = formatDateForSheet(getLondonNow());

  if (date === today && minutes <= getTodayMinutes()) {
    minutes = roundUpToNextSlot(getTodayMinutes() + 1);
  }

  if (minutes < OPENING_MINUTES) {
    minutes = OPENING_MINUTES;
  }

  while (minutes <= CLOSING_MINUTES) {
    const displayTime = formatDisplayTime(minutes);
    const taken = await isSlotTaken(date, displayTime);

    if (!taken) return displayTime;

    minutes += SLOT_MINUTES;
  }

  return null;
}

export async function validateRequestedSlot(date, time) {
  const requestedMinutes = parseTimeToMinutes(time);

  if (requestedMinutes === null) {
    return {
      ok: false,
      reason: "invalid",
      suggestion: null
    };
  }

  if (!isWithinOpeningHours(requestedMinutes)) {
    return {
      ok: false,
      reason: "closed",
      suggestion: null
    };
  }

  if (requestedMinutes % SLOT_MINUTES !== 0) {
    return {
      ok: false,
      reason: "not_half_hour",
      suggestion: await findNextAvailableSlot(date, time)
    };
  }

  const today = formatDateForSheet(getLondonNow());

  if (date === today && requestedMinutes <= getTodayMinutes()) {
    return {
      ok: false,
      reason: "past",
      suggestion: await findNextAvailableSlot(date, time)
    };
  }

  const taken = await isSlotTaken(date, time);

  if (taken) {
    return {
      ok: false,
      reason: "taken",
      suggestion: await findNextAvailableSlot(date, time)
    };
  }

  return {
    ok: true,
    reason: null,
    suggestion: null
  };
}
