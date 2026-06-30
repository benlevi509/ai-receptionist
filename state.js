export const state = {
  conversationHistory: [],
  booking: {},
  bookingActive: false,
  bookingStep: null,
  pendingTime: null,
  pendingName: null
};

export function resetState() {
  state.conversationHistory = [];
  state.booking = {};
  state.bookingActive = false;
  state.bookingStep = null;
  state.pendingTime = null;
  state.pendingName = null;
}
