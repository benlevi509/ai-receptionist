export const state = {
  conversationHistory: [],

  booking: {
    people: null,
    date: null,
    time: null,
    name: null
  },

  bookingActive: false,
  bookingStep: null,

  pendingTime: null,
  pendingName: null,
  correctionTarget: null,

  silenceCount: 0,
  repeatCount: 0,
  lastQuestion: null,

  awaitingAvailabilityConfirmation: false
};

export function resetState() {
  state.conversationHistory = [];

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
  state.correctionTarget = null;

  state.silenceCount = 0;
  state.repeatCount = 0;
  state.lastQuestion = null;

  state.awaitingAvailabilityConfirmation = false;
}
