export const bookings = {};

/* Create booking slot if it doesn't exist */

export function createSlot(date, time) {

  const key = `${date}-${time}`;

  if (!bookings[key]) {
    bookings[key] = [];
  }

}

/* Check if slot is full */

export function isSlotFull(date, time, maxBookings) {

  const key = `${date}-${time}`;

  if (!bookings[key]) return false;

  return bookings[key].length >= maxBookings;

}

/* Save booking */

export function addBooking(date, time, bookingData) {

  const key = `${date}-${time}`;

  if (!bookings[key]) {
    bookings[key] = [];
  }

  bookings[key].push(bookingData);

}
