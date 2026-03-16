export const bookingMemory = {};

/* Create memory for a new call */

export function createCallMemory(callSid) {

  bookingMemory[callSid] = {
    partySize: null,
    date: null,
    time: null,
    name: null,
    phone: null
  };

}

/* Get memory for a call */

export function getCallMemory(callSid) {
  return bookingMemory[callSid];
}

/* Update memory fields */

export function updateCallMemory(callSid, field, value) {

  if (!bookingMemory[callSid]) return;

  bookingMemory[callSid][field] = value;

}
