export function isEndingPhrase(text) {
  const lower = text.toLowerCase().trim();

  return [
    "bye",
    "goodbye",
    "that's all",
    "thats all",
    "nothing else",
    "no thanks",
    "no thank you",
    "nope that's all",
    "nope thats all",
    "no that's it",
    "no thats it",
    "all good",
    "that's everything",
    "thats everything",
    "that's it",
    "thats it",
    "thanks bye"
  ].some(p => lower.includes(p));
}

export function isAiGoodbye(text) {
  const lower = text.toLowerCase();

  return [
    "goodbye",
    "bye",
    "have a wonderful",
    "have a great day",
    "have a lovely day",
    "have a nice day",
    "thanks for calling",
    "thank you for calling"
  ].some(p => lower.includes(p));
}

export function wantsBooking(text) {
  const lower = text.toLowerCase();

  return [
    "book",
    "booking",
    "reservation",
    "reserve",
    "table",
    "space",
    "availability"
  ].some(p => lower.includes(p));
}

export function confirms(text) {
  const lower = text.toLowerCase();

  return [
    "yes",
    "yeah",
    "yep",
    "correct",
    "that's right",
    "thats right",
    "that's fine",
    "thats fine",
    "perfect",
    "go ahead",
    "book it",
    "put it down",
    "that works",
    "sounds good"
  ].some(p => lower.includes(p));
}

export function denies(text) {
  const lower = text.toLowerCase();

  return [
    "no",
    "nope",
    "nah",
    "not right",
    "wrong",
    "incorrect",
    "no thank you",
    "no thanks"
  ].some(p => lower.includes(p));
}
