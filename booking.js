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

function bookingSummaryQuestion() {
  return `Just to confirm, that's a reservation for ${state.booking.people} on ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}. Is that all correct?`;
}

export async function handleBooking(speech) {
  const startingStep = state.bookingStep;

  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);

  if (startingStep === "confirmDetails") {
    if (confirms(speech)) {
      const completedBooking = { ...state.booking };
      await saveBookingToSheet(completedBooking);

      state.bookingActive = false;
      state.bookingStep = null;
      state.pendingTime = null;
      state.pendingName = null;

      return `All set. You're booked for ${state.booking.people} on ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}. Anything else?`;
    }

    if (denies(speech)) {
      state.bookingStep = "correction";
      return "Of course. Which part is wrong: people, date, time, or name?";
    }

    return "Sorry, is that booking correct?";
  }

  if (startingStep === "correction") {
    const lower = speech.toLowerCase();
    const correctedPeople = extractPeople(speech);
    const correctedDate = formatDate(speech);
    const correctedTime = extractTime(speech);
    const correctedName = extractName(speech);

    if (lower.includes("people") || lower.includes("guest") || correctedPeople) {
      if (correctedPeople) state.booking.people = correctedPeople;
      state.bookingStep = "confirmDetails";
      return bookingSummaryQuestion();
    }

    if (lower.includes("date") || lower.includes("day") || correctedDate) {
      if (correctedDate) state.booking.date = correctedDate;

      if (correctedTime) {
        const validation = await validateRequestedSlot(state.booking.date, correctedTime);

        if (!validation.ok) {
          if (validation.suggestion) {
            state.pendingTime = validation.suggestion;
            state.bookingStep = "confirmSuggestedTime";
            return `${correctedTime} isn't available. I can do ${validation.suggestion}. Shall I book that?`;
          }

          return "Sorry, I can't find a suitable slot for that time.";
        }

        state.booking.time = correctedTime;
        state.bookingStep = "confirmDetails";
        return bookingSummaryQuestion();
      }

      state.booking.time = null;
      state.bookingStep = "time";
      return "No problem. What time should I check for that date?";
    }

    if (lower.includes("time") || correctedTime) {
      const validation = await validateRequestedSlot(state.booking.date, correctedTime);

      if (!validation.ok) {
        if (validation.suggestion) {
          state.pendingTime = validation.suggestion;
          state.bookingStep = "confirmSuggestedTime";
          return `${correctedTime} isn't available. I can do ${validation.suggestion}. Shall I book that?`;
        }

        return "Sorry, I can't find a suitable slot for that time.";
      }

      state.booking.time = correctedTime;
      state.bookingStep = "confirmDetails";
      return bookingSummaryQuestion();
    }

    if (lower.includes("name") || lower.includes("under") || correctedName) {
      state.booking.name = null;
      state.pendingName = null;
      state.bookingStep = "name";
      return "No worries. What name should I put it under?";
    }

    return "Which part should I change: people, date, time, or name?";
  }

  if (startingStep === "confirmSuggestedTime") {
    if (confirms(speech)) {
      state.booking.time = state.pendingTime;
      state.pendingTime = null;
      state.bookingStep = state.booking.name ? "confirmDetails" : "name";

      if (state.booking.name) return bookingSummaryQuestion();
      return "Great. What name should I put it under?";
    }

    if (denies(speech)) {
      state.pendingTime = null;
      state.bookingStep = "time";
      return "No problem. What other time would you like?";
    }

    return "Sorry, should I book that suggested time?";
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
      state.bookingStep = "name";
      state.pendingName = null;
      return "No problem. What name should I put it under?";
    }

    if (correctedName) {
      state.pendingName = correctedName;
      return `I heard ${state.pendingName}. Is that right?`;
    }

    return "Sorry, what name should I put it under?";
  }

  if (startingStep === "name") {
    const name = extractName(speech);

    if (name) {
      state.pendingName = name;
      state.bookingStep = "confirmName";
      return `I heard ${state.pendingName}. Is that right?`;
    }

    return "Sorry, what name should I put it under?";
  }

  if (people && !state.booking.people) {
    state.booking.people = people;
  }

  if (!state.booking.people) {
    state.bookingStep = "people";
    return "Of course. How many people is the reservation for?";
  }

  if (date && !state.booking.date) {
    state.booking.date = date;
  }

  if (!state.booking.date) {
    state.bookingStep = "date";
    return "Great. What date would you like the reservation for?";
  }

  if (time && !state.booking.time) {
    const validation = await validateRequestedSlot(state.booking.date, time);

    if (!validation.ok) {
      if (validation.suggestion) {
        state.pendingTime = validation.suggestion;
        state.bookingStep = "confirmSuggestedTime";

        if (validation.reason === "past") {
          return `${time} has already passed. I can do ${validation.suggestion}. Shall I book that?`;
        }

        if (validation.reason === "not_half_hour") {
          return `Bookings are every 30 minutes. I can do ${validation.suggestion}. Shall I book that?`;
        }

        if (validation.reason === "taken") {
          return `${time} is already booked. I can do ${validation.suggestion}. Shall I book that?`;
        }

        return `I can do ${validation.suggestion}. Shall I book that?`;
      }

      return "Sorry, I can't find a suitable available slot for that time.";
    }

    state.booking.time = time;
  }

  if (!state.booking.time) {
    state.bookingStep = "time";
    return "Perfect. What time should I book it for?";
  }

  if (!state.booking.name) {
    state.bookingStep = "name";
    return "Great, one last question. What name should I put it under?";
  }

  state.bookingStep = "confirmDetails";
  return bookingSummaryQuestion();
}
