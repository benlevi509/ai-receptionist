export const state = {
  conversationHistory: [],

  booking: {},

  bookingActive: false,
  bookingStep: null,

  pendingTime: null,
  pendingName: null,

  correctionTarget: null,

  silenceCount: 0,

  lastQuestion: null,

  awaitingAvailabilityConfirmation: false
};

export function resetState() {
  state.conversationHistory = [];

  state.booking = {};

  state.bookingActive = false;
  state.bookingStep = null;

  state.pendingTime = null;
  state.pendingName = null;

  state.correctionTarget = null;

  state.silenceCount = 0;

  state.lastQuestion = null;

  state.awaitingAvailabilityConfirmation = false;
}
