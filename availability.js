import businessConfig from "./businessConfig.js";
import { getExistingBookings } from "./sheets.js";
import {
  formatDateForSheet,
  formatDisplayTime,
  getLondonNow,
  getTodayMinutes,
  parseTimeToMinutes
} from "./helpers.js";

function slotMinutes() {
  const configured = Number(businessConfig.bookingSettings?.bookingIntervalMinutes);
  return Number.isInteger(configured) && configured > 0 ? configured : 30;
}

function getMaxBookingsPerSlot() {
  const value = Number(businessConfig.bookingSettings?.maxBookingsPerSlot);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function roundToConfiguredSlot(minutes) {
  const interval = slotMinutes();
  return Math.ceil(minutes / interval) * interval;
}

function parseClockPart(hourText, minuteText, meridiemText) {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  const meridiem = String(meridiemText || "").toLowerCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function parseOpeningRange(value) {
  const text = String(value || "").trim();
  if (!text || /^closed$/i.test(text)) return null;

  const match = text.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i
  );
  if (!match) return null;

  const open = parseClockPart(match[1], match[2], match[3]);
  const close = parseClockPart(match[4], match[5], match[6]);
  if (open === null || close === null || close <= open) return null;

  return { open, close };
}

function bookingWindowForDate(date) {
  const match = String(date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const dateObj = new Date(year, month, day);

  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month ||
    dateObj.getDate() !== day
  ) {
    return null;
  }

  const weekdayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ];

  const weekday = weekdayNames[dateObj.getDay()];
  const openingRange = parseOpeningRange(businessConfig.openingHours?.[weekday]);
  if (!openingRange) return null;

  // Optional booking-specific limits may make the bookable window narrower,
  // but never wider than the restaurant's real opening hours.
  const configuredEarliest = parseTimeToMinutes(businessConfig.bookingSettings?.earliestBookingTime);
  const configuredLatest = parseTimeToMinutes(businessConfig.bookingSettings?.latestBookingTime);
  const configuredDuration = Number(businessConfig.bookingSettings?.defaultBookingLengthMinutes);
  const bookingDuration = Number.isFinite(configuredDuration) && configuredDuration > 0
    ? configuredDuration
    : 0;
  const latestStartBeforeClosing = openingRange.close - bookingDuration;

  return {
    open: configuredEarliest === null
      ? openingRange.open
      : Math.max(openingRange.open, configuredEarliest),
    close: configuredLatest === null
      ? latestStartBeforeClosing
      : Math.min(latestStartBeforeClosing, configuredLatest)
  };
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

  const window = bookingWindowForDate(date);
  if (!window || window.close <= window.open) return null;

  minutes = roundToConfiguredSlot(minutes);
  const today = formatDateForSheet(getLondonNow());

  if (date === today && minutes <= getTodayMinutes()) {
    minutes = roundToConfiguredSlot(getTodayMinutes() + 1);
  }

  if (minutes < window.open) minutes = roundToConfiguredSlot(window.open);

  const bookings = existingBookings || await getExistingBookings();

  while (minutes < window.close) {
    const count = countBookingsForSlot(bookings, date, minutes);
    if (count < getMaxBookingsPerSlot()) return formatDisplayTime(minutes);
    minutes += slotMinutes();
  }

  return null;
}

export async function findAnyAvailableSlot(date) {
  if (!date) return null;

  const window = bookingWindowForDate(date);
  if (!window) return null;

  const bookings = await getExistingBookings();
  return findNextAvailableSlot(date, formatDisplayTime(window.open), bookings);
}

export async function validateRequestedSlot(date, time) {
  const requestedMinutes = parseTimeToMinutes(time);
  if (requestedMinutes === null) {
    return { ok: false, reason: "invalid", suggestion: null };
  }

  const window = bookingWindowForDate(date);
  if (!window) {
    return { ok: false, reason: "closed", suggestion: null };
  }

  if (requestedMinutes < window.open || requestedMinutes >= window.close) {
    let suggestion = null;
    if (requestedMinutes < window.open) {
      const bookings = await getExistingBookings();
      suggestion = await findNextAvailableSlot(date, formatDisplayTime(window.open), bookings);
    }
    return { ok: false, reason: "closed", suggestion };
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
