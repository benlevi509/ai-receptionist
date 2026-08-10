import businessConfig from "./businessConfig.js";
import { getExistingBookings } from "./sheets.js";
import {
  formatDateForSheet,
  formatDisplayTime,
  getLondonNow,
  getTodayMinutes,
  parseTimeToMinutes
} from "./helpers.js";

function configuredMinutes(value, fallback) {
  return parseTimeToMinutes(value) ?? fallback;
}

function slotMinutes() {
  const configured = Number(businessConfig.bookingSettings?.bookingIntervalMinutes);
  return Number.isInteger(configured) && configured > 0 ? configured : 30;
}

function earliestMinutes() {
  return configuredMinutes(businessConfig.bookingSettings?.earliestBookingTime, 9 * 60);
}

function latestMinutes() {
  return configuredMinutes(businessConfig.bookingSettings?.latestBookingTime, 23 * 60);
}

function isWithinBookingHours(minutes) {
  return minutes >= earliestMinutes() && minutes <= latestMinutes();
}

function getMaxBookingsPerSlot() {
  const value = Number(businessConfig.bookingSettings?.maxBookingsPerSlot);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function roundToConfiguredSlot(minutes) {
  const interval = slotMinutes();
  return Math.ceil(minutes / interval) * interval;
}

export async function getSlotBookingCount(date, time) {
  const bookings = await getExistingBookings();
  const requestedMinutes = parseTimeToMinutes(time);
  if (requestedMinutes === null) return 0;

  return bookings.filter(booking => {
    if (booking.date !== date) return false;
    return parseTimeToMinutes(booking.time) === requestedMinutes;
  }).length;
}

export async function isSlotTaken(date, time) {
  return (await getSlotBookingCount(date, time)) >= getMaxBookingsPerSlot();
}

export async function findNextAvailableSlot(date, requestedTime) {
  let minutes = parseTimeToMinutes(requestedTime);
  if (minutes === null) return null;

  minutes = roundToConfiguredSlot(minutes);
  const today = formatDateForSheet(getLondonNow());

  if (date === today && minutes <= getTodayMinutes()) {
    minutes = roundToConfiguredSlot(getTodayMinutes() + 1);
  }

  if (minutes < earliestMinutes()) minutes = earliestMinutes();

  while (minutes <= latestMinutes()) {
    const displayTime = formatDisplayTime(minutes);
    if (!(await isSlotTaken(date, displayTime))) return displayTime;
    minutes += slotMinutes();
  }

  return null;
}

export async function validateRequestedSlot(date, time) {
  const requestedMinutes = parseTimeToMinutes(time);
  if (requestedMinutes === null) {
    return { ok: false, reason: "invalid", suggestion: null };
  }

  if (!isWithinBookingHours(requestedMinutes)) {
    return {
      ok: false,
      reason: "closed",
      suggestion: await findNextAvailableSlot(date, time)
    };
  }

  if (requestedMinutes % slotMinutes() !== 0) {
    return {
      ok: false,
      reason: "not_on_interval",
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

  if (await isSlotTaken(date, time)) {
    return {
      ok: false,
      reason: "taken",
      suggestion: await findNextAvailableSlot(date, time)
    };
  }

  return { ok: true, reason: null, suggestion: null };
}
