import { state } from "./state.js";
import { saveBookingToSheet } from "./sheets.js";
import { validateRequestedSlot } from "./availability.js";

import {
  extractPeople,
  extractName,
  extractTime,
  formatDate,
  formatDateForSpeech
} from "./helpers.js";

import { confirms, denies } from "./intents.js";

const MAX_PEOPLE = 6;

function bookingSummaryQuestion() {
  return `Just to confirm, that's a table for ${state.booking.people} people ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}. Is that right?`;
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
    lower.includes("tonight") ||
    lower.includes("today") ||
    lower.includes("tomorrow")
  );
}

async function handleAvailabilityQuestion(date, time) {
  const chosenDate = date || state.booking.date || null;

  if (!chosenDate) {
    state.bookingActive = true;
    state.bookingStep = "availabilityDate";
    return "Sure, what day were you hoping to come in?";
  }

  if (!time) {
    state.booking.date = chosenDate;
    state.bookingActive = true;
    state.bookingStep = "availabilityTime";
    return `Sure, what time were you hoping to come in ${formatDateForSpeech(chosenDate)}?`;
  }

  const validation = await validateRequestedSlot(chosenDate, time);

  if (validation.ok) {
    state.booking.date = chosenDate;
    state.pendingTime = time;
    state.bookingActive = true;
    state.bookingStep = "confirmAvailableTime";
    return `Yes, we have space ${formatDateForSpeech(chosenDate)} at ${time}. Would you like me to book that?`;
  }

  if (validation.suggestion) {
    state.booking.date = chosenDate;
    state.pendingTime = validation.suggestion;
    state.bookingActive = true;
    state.bookingStep = "confirmSuggestedTime";
    return `${time} isn't available, but ${validation.suggestion} is. Would that work?`;
  }

  return `I can't see space at ${time}. What other time would you like me to check?`;
}

async function validateAndSetTime(time) {
  const validation = await validateRequestedSlot(state.booking.date, time);

  if (!validation.ok) {
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

export async function handleBooking(speech) {
  const startingStep = state.bookingStep;

  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);
  const name = extractName(speech);

  if (people && people > MAX_PEOPLE) {
    return `We can only take bookings up to ${MAX_PEOPLE} people.`;
  }

  if (isAvailabilityQuestion(speech) && startingStep !== "confirmDetails") {
    return await handleAvailabilityQuestion(date, time);
  }

  if (startingStep === "availabilityDate") {
    if (!date) return "What day were you hoping to come in?";

    state.booking.date = date;
    state.bookingStep = "availabilityTime";

    return `What time were you hoping to come in ${formatDateForSpeech(date)}?`;
  }

  if (startingStep === "availabilityTime") {
    if (!time) return "What time would you like me to check?";
    return await handleAvailabilityQuestion(state.booking.date, time);
  }

  if (startingStep === "confirmAvailableTime" || startingStep === "confirmSuggestedTime") {
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

  if (people && !state.booking.people) state.booking.people = people;
  if (date && !state.booking.date) state.booking.date = date;

  if (time && !state.booking.time && state.booking.date) {
    const result = await validateAndSetTime(time);
    if (!result.ok) return result.reply;
  }

  if (name && !state.booking.name && startingStep !== "confirmName") {
    state.pendingName = name;
    state.bookingStep = "confirmName";
    return `I heard ${state.pendingName}. Is that right?`;
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
    if (!name) return "What name should I put it under?";

    state.pendingName = name;
    state.bookingStep = "confirmName";

    return `I heard ${state.pendingName}. Is that right?`;
  }

  if (startingStep === "confirmName") {
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

    if (name) {
      state.pendingName = name;
      return `I heard ${state.pendingName}. Is that right?`;
    }

    return "Is that name correct?";
  }

  if (startingStep === "confirmDetails") {
    if (confirms(speech)) {
      const completedBooking = { ...state.booking };
      const saved = await saveBookingToSheet(completedBooking);

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

      if (!saved) {
        return "I couldn't save that booking properly. Please try again in a moment.";
      }

      return "All set, your booking is confirmed. Anything else I can help with?";
    }

    if (denies(speech)) {
      state.bookingStep = "correction";
      return "No worries, which part should I change: the people, date, time, or name?";
    }

    return "Is that correct?";
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
