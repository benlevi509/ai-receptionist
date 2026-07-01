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
  return `Just to confirm, that's a reservation for ${state.booking.people} people on ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}. Is that all correct?`;
}

function bookingSummaryStatement() {
  if (!state.booking.people || !state.booking.date || !state.booking.time || !state.booking.name) {
    return "I don't have the full booking details yet.";
  }

  return `Your booking is for ${state.booking.people} people on ${formatDateForSpeech(state.booking.date)} at ${state.booking.time}, under ${state.booking.name}.`;
}

function wantsRepeatBooking(speech) {
  const lower = speech.toLowerCase();
  return (
    lower.includes("repeat") ||
    lower.includes("say it again") ||
    lower.includes("what is my booking") ||
    lower.includes("booking details") ||
    lower.includes("read it back")
  );
}

function detectCorrectionTarget(speech) {
  const lower = speech.toLowerCase();

  if (lower.includes("date") || lower.includes("day")) return "date";
  if (lower.includes("time")) return "time";
  if (lower.includes("people") || lower.includes("person") || lower.includes("guests")) return "people";
  if (lower.includes("name") || lower.includes("under")) return "name";

  return null;
}

async function validateAndSetTime(time) {
  const validation = await validateRequestedSlot(state.booking.date, time);

  if (!validation.ok) {
    if (validation.reason === "closed") {
      return {
        ok: false,
        reply: `Sorry, we're closed at ${time}. We're open from 9 AM to 11 PM.`
      };
    }

    if (validation.suggestion) {
      state.pendingTime = validation.suggestion;
      state.bookingStep = "confirmSuggestedTime";

      if (validation.reason === "past") {
        return {
          ok: false,
          reply: `${time} has already passed. I can do ${validation.suggestion}. Shall I book that?`
        };
      }

      if (validation.reason === "not_half_hour") {
        return {
          ok: false,
          reply: `Bookings are every 30 minutes. I can do ${validation.suggestion}. Shall I book that?`
        };
      }

      if (validation.reason === "taken") {
        return {
          ok: false,
          reply: `${time} is already booked. I can do ${validation.suggestion}. Shall I book that?`
        };
      }

      return {
        ok: false,
        reply: `I can do ${validation.suggestion}. Shall I book that?`
      };
    }

    return {
      ok: false,
      reply: "Sorry, I can't find a suitable available slot for that time."
    };
  }

  state.booking.time = time;
  return { ok: true };
}

export async function handleBooking(speech) {
  const startingStep = state.bookingStep;
  const lower = speech.toLowerCase();

  const people = extractPeople(speech);
  const date = formatDate(speech);
  const time = extractTime(speech);

  if (wantsRepeatBooking(speech)) {
    return bookingSummaryStatement();
  }

  if (people && people > MAX_PEOPLE) {
    return `Sorry, we don't have capacity for ${people} people. Our maximum capacity is ${MAX_PEOPLE}.`;
  }

  if (startingStep === "confirmDetails") {
    if (confirms(speech)) {
      const completedBooking = { ...state.booking };
      await saveBookingToSheet(completedBooking);

      const finalReply = `All set, your booking is confirmed. Anything else I can help with?`;

      state.bookingActive = false;
      state.bookingStep = null;
      state.pendingTime = null;
      state.pendingName = null;

      return finalReply;
    }

    if (denies(speech)) {
      const target = detectCorrectionTarget(speech);

      if (target) {
        state.correctionTarget = target;

        if (target === "date") {
          state.bookingStep = "correctDate";
          return "No problem. What date should I change it to?";
        }

        if (target === "time") {
          state.bookingStep = "correctTime";
          return "No problem. What time should I change it to?";
        }

        if (target === "people") {
          state.bookingStep = "correctPeople";
          return "No problem. How many people should I change it to?";
        }

        if (target === "name") {
          state.bookingStep = "correctName";
          return "No problem. What name should I put it under?";
        }
      }

      state.bookingStep = "correction";
      return "Of course. Which part is wrong: people, date, time, or name?";
    }

    return "Sorry, I didn't quite understand. Is the booking correct?";
  }

  if (startingStep === "correction") {
    const target = detectCorrectionTarget(speech);

    if (target === "date") {
      state.bookingStep = "correctDate";
      return "No problem. What date should I change it to?";
    }

    if (target === "time") {
      state.bookingStep = "correctTime";
      return "No problem. What time should I change it to?";
    }

    if (target === "people") {
      state.bookingStep = "correctPeople";
      return "No problem. How many people should I change it to?";
    }

    if (target === "name") {
      state.bookingStep = "correctName";
      return "No problem. What name should I put it under?";
    }

    return "Sorry, I didn't quite understand. Which part should I change: people, date, time, or name?";
  }

  if (startingStep === "correctPeople") {
    const correctedPeople = extractPeople(speech);

    if (!correctedPeople) {
      return "Sorry, how many people should I change it to?";
    }

    if (correctedPeople > MAX_PEOPLE) {
      return `Sorry, we don't have capacity for ${correctedPeople} people. Our maximum capacity is ${MAX_PEOPLE}.`;
    }

    state.booking.people = correctedPeople;
    state.bookingStep = "confirmDetails";
    return bookingSummaryQuestion();
  }

  if (startingStep === "correctDate") {
    const correctedDate = formatDate(speech);

    if (!correctedDate) {
      return "Sorry, I didn't quite understand the date. What date should I change it to?";
    }

    state.booking.date = correctedDate;
    state.bookingStep = "confirmDetails";
    return bookingSummaryQuestion();
  }

  if (startingStep === "correctTime") {
    const correctedTime = extractTime(speech);

    if (!correctedTime) {
      return "Sorry, I didn't quite understand the time. What time should I change it to?";
    }

    const result = await validateAndSetTime(correctedTime);
    if (!result.ok) return result.reply;

    state.bookingStep = "confirmDetails";
    return bookingSummaryQuestion();
  }

  if (startingStep === "correctName") {
    const correctedName = extractName(speech);

    if (!correctedName) {
      return "Sorry, what name should I put it under?";
    }

    state.pendingName = correctedName;
    state.bookingStep = "confirmName";
    return `I heard ${state.pendingName}. Is that right?`;
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

    return "Sorry, I didn't quite understand. What name should I put it under?";
  }

  if (startingStep === "name") {
    const name = extractName(speech);

    if (name) {
      state.pendingName = name;
      state.bookingStep = "confirmName";
      return `I heard ${state.pendingName}. Is that right?`;
    }

    return "Sorry, I didn't quite understand. What name should I put it under?";
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
    const result = await validateAndSetTime(time);
    if (!result.ok) return result.reply;
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
