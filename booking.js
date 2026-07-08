import { state } from "./state.js";
import { saveBookingToSheet } from "./sheets.js";
import { validateRequestedSlot } from "./availability.js";

import {
  extractPeople,
  extractName,
  extractTime,
  formatDate,
  formatDateForSpeech,
  formatDateForSheet,
  formatDisplayTime,
  getLondonNow,
  getTodayMinutes,
  roundUpToNextSlot,
  SLOT_MINUTES
} from "./helpers.js";

import { confirms, denies } from "./intents.js";

const MAX_PEOPLE = 6;
const OPENING_MINUTES = 9 * 60;
const CLOSING_MINUTES = 23 * 60;

function ensureBookingShape() {
  if (!state.booking) state.booking = {};
  state.booking.people ??= null;
  state.booking.date ??= null;
  state.booking.time ??= null;
  state.booking.name ??= null;
}

function bookingSummaryQuestion() {
  return `Just to confirm, that's a table for ${state.booking.people} people ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}. Is that right?`;
}

function bookingSummaryStatement() {
  ensureBookingShape();

  if (!state.booking.people || !state.booking.date || !state.booking.time || !state.booking.name) {
    return "I don't have the full booking details yet.";
  }

  return `Your booking is for ${state.booking.people} people ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}.`;
}

function isAvailabilityQuestion(speech) {
  const lower = String(speech || "").toLowerCase();

  return (
    lower.includes("availability") ||
    lower.includes("available") ||
    lower.includes("space") ||
    lower.includes("room") ||
    lower.includes("free") ||
    lower.includes("any tables") ||
    lower.includes("have a table") ||
    lower.includes("got a table") ||
    lower.includes("come in") ||
    lower.includes("walk in") ||
    lower.includes("fit us in") ||
    lower.includes("fit me in") ||
    lower.includes("tonight") ||
    lower.includes("today")
  );
}

function wantsRepeatBooking(speech) {
  const lower = String(speech || "").toLowerCase();

  return (
    lower.includes("repeat") ||
    lower.includes("say it again") ||
    lower.includes("what is my booking") ||
    lower.includes("booking details") ||
    lower.includes("read it back")
  );
}

function detectCorrectionTarget(speech) {
  const lower = String(speech || "").toLowerCase();

  if (lower.includes("date") || lower.includes("day")) return "date";
  if (lower.includes("time")) return "time";
  if (lower.includes("people") || lower.includes("person") || lower.includes("guests")) return "people";
  if (lower.includes("name") || lower.includes("under")) return "name";

  return null;
}

async function getAvailableSlotsForDate(date) {
  const today = formatDateForSheet(getLondonNow());
  let minutes = OPENING_MINUTES;

  if (date === today) {
    minutes = Math.max(OPENING_MINUTES, roundUpToNextSlot(getTodayMinutes() + 1));
  }

  const slots = [];

  while (minutes < CLOSING_MINUTES && slots.length < 3) {
    const displayTime = formatDisplayTime(minutes);
    const validation = await validateRequestedSlot(date, displayTime);

    if (validation.ok) slots.push(displayTime);

    minutes += SLOT_MINUTES;
  }

  return slots;
}

async function handleAvailabilityQuestion(speech, date, time) {
  ensureBookingShape();

  const chosenDate = date || state.booking.date || formatDateForSheet(getLondonNow());

  if (!time) {
    state.booking.date = chosenDate;
    state.bookingActive = true;
    state.bookingStep = "availabilityTime";

    return `Sure — what time were you hoping to come in ${formatDateForSpeech(chosenDate)}?`;
  }

  const validation = await validateRequestedSlot(chosenDate, time);

  if (validation.ok) {
    state.booking.date = chosenDate;
    state.pendingTime = time;
    state.bookingActive = true;
    state.bookingStep = "confirmAvailableTime";

    return `Yes, we have space ${formatDateForSpeech(chosenDate)} at ${time}. Would you like me to book that?`;
  }

  if (validation.reason === "closed") {
    return `We're closed at ${time}. We're open from 9 AM to 11 PM. What other time would you like me to check?`;
  }

  if (validation.suggestion) {
    state.booking.date = chosenDate;
    state.pendingTime = validation.suggestion;
    state.bookingActive = true;
    state.bookingStep = "confirmSuggestedTime";

    return `${time} isn't available, but ${validation.suggestion} is. Would you like that instead?`;
  }

  return `I can't see space at ${time}. What other time would you like me to check?`;
}

async function validateAndSetTime(time) {
  const validation = await validateRequestedSlot(state.booking.date, time);

  if (!validation.ok) {
    if (validation.reason === "closed") {
      return {
        ok: false,
        reply: `We're closed at ${time}. We're open from 9 AM to 11 PM. What other time would you like?`
      };
    }

    if (validation.suggestion) {
      state.pendingTime = validation.suggestion;
      state.bookingStep = "confirmSuggestedTime";

      return {
        ok: false,
        reply: `${time} isn't available, but ${validation.suggestion} is. Would that work?`
      };
    }

    return {
      ok: false,
      reply: "I can't find a slot for that time. What other time would you like?"
    };
  }

  state.booking.time = time;
  return { ok: true };
}

function resetAfterBooking() {
  state.booking = {
    people: null,
    date: null,
    time: null,
    name: null
  };

  state.bookingActive = false;
  state.bookingStep = null;
  state.pendingTime = null;
  state.pendingName = null;
}

export async function handleBooking(speech) {
  ensureBookingShape();

  const startingStep = state.bookingStep;

  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);

  if (wantsRepeatBooking(speech)) {
    return bookingSummaryStatement();
  }

  if (people && people > MAX_PEOPLE) {
    return `Sorry, we can only take bookings up to ${MAX_PEOPLE} people.`;
  }

  if (isAvailabilityQuestion(speech) && !state.booking.name && startingStep !== "confirmDetails") {
    return await handleAvailabilityQuestion(speech, date, time);
  }

  if (startingStep === "availabilityTime") {
    if (!time) return "What time would you like me to check?";
    return await handleAvailabilityQuestion(speech, state.booking.date, time);
  }

  if (startingStep === "confirmAvailableTime") {
    if (confirms(speech)) {
      state.booking.time = state.pendingTime;
      state.pendingTime = null;
      state.bookingStep = state.booking.people ? "name" : "people";

      if (!state.booking.people) return "Lovely, how many people is that for?";
      return "And what name should I put it under?";
    }

    if (denies(speech)) {
      state.pendingTime = null;
      state.bookingStep = "availabilityTime";
      return "No worries, what other time would you like me to check?";
    }

    return "Would you like me to book that time?";
  }

  if (startingStep === "confirmSuggestedTime") {
    if (confirms(speech)) {
      state.booking.time = state.pendingTime;
      state.pendingTime = null;
      state.bookingStep = state.booking.people ? "name" : "people";

      if (!state.booking.people) return "Lovely, how many people is that for?";
      return "And what name should I put it under?";
    }

    if (denies(speech)) {
      state.pendingTime = null;
      state.bookingStep = "availabilityTime";
      return "No problem, what other time would you like?";
    }

    return "Would that time work for you?";
  }

  if (startingStep === "people") {
    if (!people) return "How many people is that for?";

    state.booking.people = people;
    state.bookingStep = state.booking.date ? "time" : "date";

    if (!state.booking.date) return "Sure, what day would you like to come in?";
    return `And what time would you like ${formatDateForSpeech(state.booking.date)}?`;
  }

  if (startingStep === "date") {
    if (!date) return "What day would you like to come in?";

    state.booking.date = date;
    state.bookingStep = "time";

    return `And what time would you like ${formatDateForSpeech(date)}?`;
  }

  if (startingStep === "time") {
    if (!time) return "What time would you like?";

    const result = await validateAndSetTime(time);
    if (!result.ok) return result.reply;

    state.bookingStep = "name";
    return "And what name should I put it under?";
  }

  if (startingStep === "name") {
    const name = extractName(speech);

    if (!name) return "What name should I put it under?";

    state.pendingName = name;
    state.bookingStep = "confirmName";

    return `I heard ${state.pendingName}. Is that right?`;
  }

  if (startingStep === "confirmName") {
    const correctedName = extractName(speech);

    if (confirms(speech)) {
      state.booking.name = state.pendingName;
      state.pendingName = null;
      state.bookingStep = "confirmDetails";

      return bookingSummaryQuestion();
    }

    if (denies(speech)) {
      state.pendingName = null;
      state.bookingStep = "name";

      return "No worries, what name should I put it under?";
    }

    if (correctedName) {
      state.pendingName = correctedName;
      return `I heard ${state.pendingName}. Is that right?`;
    }

    return "Is that name correct?";
  }

  if (startingStep === "confirmDetails") {
    if (confirms(speech)) {
      const completedBooking = { ...state.booking };
      const saved = await saveBookingToSheet(completedBooking);

      resetAfterBooking();

      if (!saved) {
        return "I'm sorry, I couldn't save that booking properly. Please try again in a moment.";
      }

      return "All set, your booking is confirmed. Anything else I can help with?";
    }

    if (denies(speech)) {
      const target = detectCorrectionTarget(speech);

      if (target === "date") {
        state.bookingStep = "correctDate";
        return "Sure, what date should I change it to?";
      }

      if (target === "time") {
        state.bookingStep = "correctTime";
        return "Sure, what time should I change it to?";
      }

      if (target === "people") {
        state.bookingStep = "correctPeople";
        return "Sure, how many people should it be?";
      }

      if (target === "name") {
        state.bookingStep = "correctName";
        return "Sure, what name should I put it under?";
      }

      state.bookingStep = "correction";
      return "No worries, which part should I change: the people, date, time, or name?";
    }

    return "Is that correct?";
  }

  if (startingStep === "correction") {
    const target = detectCorrectionTarget(speech);

    if (target === "date") {
      state.bookingStep = "correctDate";
      return "What date should I change it to?";
    }

    if (target === "time") {
      state.bookingStep = "correctTime";
      return "What time should I change it to?";
    }

    if (target === "people") {
      state.bookingStep = "correctPeople";
      return "How many people should it be?";
    }

    if (target === "name") {
      state.bookingStep = "correctName";
      return "What name should I put it under?";
    }

    return "Which part should I change: the people, date, time, or name?";
  }

  if (startingStep === "correctPeople") {
    const correctedPeople = extractPeople(speech);

    if (!correctedPeople) return "How many people should it be?";

    if (correctedPeople > MAX_PEOPLE) {
      return `Sorry, we can only take bookings up to ${MAX_PEOPLE} people.`;
    }

    state.booking.people = correctedPeople;
    state.bookingStep = "confirmDetails";

    return bookingSummaryQuestion();
  }

  if (startingStep === "correctDate") {
    const correctedDate = formatDate(speech);

    if (!correctedDate) return "What date should I change it to?";

    state.booking.date = correctedDate;
    state.bookingStep = "confirmDetails";

    return bookingSummaryQuestion();
  }

  if (startingStep === "correctTime") {
    const correctedTime = extractTime(speech);

    if (!correctedTime) return "What time should I change it to?";

    const result = await validateAndSetTime(correctedTime);
    if (!result.ok) return result.reply;

    state.bookingStep = "confirmDetails";

    return bookingSummaryQuestion();
  }

  if (startingStep === "correctName") {
    const correctedName = extractName(speech);

    if (!correctedName) return "What name should I put it under?";

    state.pendingName = correctedName;
    state.bookingStep = "confirmName";

    return `I heard ${state.pendingName}. Is that right?`;
  }

  if (people && !state.booking.people) {
    state.booking.people = people;
  }

  if (date && !state.booking.date) {
    state.booking.date = date;
  }

  if (time && !state.booking.time && state.booking.date) {
    const result = await validateAndSetTime(time);
    if (!result.ok) return result.reply;
  }

  if (!state.booking.people) {
    state.bookingStep = "people";
    return "Sure, how many people is that for?";
  }

  if (!state.booking.date) {
    state.bookingStep = "date";
    return "Sure, what day would you like to come in?";
  }

  if (!state.booking.time) {
    state.bookingStep = "time";
    return `And what time would you like ${formatDateForSpeech(state.booking.date)}?`;
  }

  if (!state.booking.name) {
    state.bookingStep = "name";
    return "And what name should I put it under?";
  }

  state.bookingStep = "confirmDetails";
  return bookingSummaryQuestion();
}
