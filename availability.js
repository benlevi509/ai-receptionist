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

function countBookingsForSlot(bookings, date, requestedMinutes) {
  return bookings.filter(booking => {
    if (booking.date !== date) return false;
    return parseTimeToMinutes(booking.time) === requestedMinutes;
  }).length;
}

export async function getSlotBookingCount(date, time, existingBookings = null) {
  const requestedMinutes = parseTimeToMinutes(time);
  if (requestedMinutes === null) return 0;

  const bookings = existingBookings || await getExistingBookings();
  return countBookingsForSlot(bookings, date, requestedMinutes);
}

export async function isSlotTaken(date, time, existingBookings = null) {
  return (await getSlotBookingCount(date, time, existingBookings)) >= getMaxBookingsPerSlot();
}

export async function findNextAvailableSlot(date, requestedTime, existingBookings = null) {
  let minutes = parseTimeToMinutes(requestedTime);
  if (minutes === null) return null;

  minutes = roundToConfiguredSlot(minutes);
  const today = formatDateForSheet(getLondonNow());

  if (date === today && minutes <= getTodayMinutes()) {
    minutes = roundToConfiguredSlot(getTodayMinutes() + 1);
  }

  if (minutes < earliestMinutes()) minutes = earliestMinutes();

  // Fetch the sheet once for the entire search. The old implementation fetched
  // the full sheet once per candidate slot, which caused avoidable multi-second
  // delays and could hit Google API rate limits.
  const bookings = existingBookings || await getExistingBookings();

  while (minutes <= latestMinutes()) {
    const count = countBookingsForSlot(bookings, date, minutes);
    if (count < getMaxBookingsPerSlot()) return formatDisplayTime(minutes);
    minutes += slotMinutes();
  }

  return null;
}

export async function findAnyAvailableSlot(date) {
  if (!date) return null;
  const bookings = await getExistingBookings();
  return findNextAvailableSlot(date, formatDisplayTime(earliestMinutes()), bookings);
}

export async function validateRequestedSlot(date, time) {
  const requestedMinutes = parseTimeToMinutes(time);
  if (requestedMinutes === null) {
    return { ok: false, reason: "invalid", suggestion: null };
  }

  if (!isWithinBookingHours(requestedMinutes)) {
    const bookings = await getExistingBookings();
    return {
      ok: false,
      reason: "closed",
      suggestion: await findNextAvailableSlot(date, time, bookings)
    };
  }

  if (requestedMinutes % slotMinutes() !== 0) {
    const bookings = await getExistingBookings();
    return {
      ok: false,
      reason: "not_on_interval",
      suggestion: await findNextAvailableSlot(date, time, bookings)
    };
  }

  const today = formatDateForSheet(getLondonNow());
  if (date === today && requestedMinutes <= getTodayMinutes()) {
    const bookings = await getExistingBookings();
    return {
      ok: false,
      reason: "past",
      suggestion: await findNextAvailableSlot(date, time, bookings)
    };
  }

  const bookings = await getExistingBookings();
  if (countBookingsForSlot(bookings, date, requestedMinutes) >= getMaxBookingsPerSlot()) {
    return {
      ok: false,
      reason: "taken",
      suggestion: await findNextAvailableSlot(date, time, bookings)
    };
  }

  return { ok: true, reason: null, suggestion: null };
}
