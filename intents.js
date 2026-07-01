export function isEndingPhrase(text) {
  const lower = String(text || "").toLowerCase().trim();

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
  const lower = String(text || "").toLowerCase();

  return [
    "goodbye",
    "bye",
    "have a great day",
    "have a lovely day",
    "have a nice day",
    "thanks for calling",
    "thank you for calling"
  ].some(p => lower.includes(p));
}

export function wantsBooking(text) {
  const lower = String(text || "").toLowerCase();

  return [
    "book",
    "booking",
    "reservation",
    "reserve",
    "table",
    "space",
    "availability",
    "available",
    "do you have",
    "have you got",
    "is there room",
    "is there space",
    "can i come",
    "fit us in",
    "fit me in"
  ].some(p => lower.includes(p));
}

export function confirms(text) {
  const lower = String(text || "").toLowerCase();

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
    "sounds good",
    "all correct",
    "that's correct",
    "thats correct"
  ].some(p => lower.includes(p));
}

export function denies(text) {
  const lower = String(text || "").toLowerCase();

  const denialPhrases = [
    "no",
    "nope",
    "nah",
    "not right",
    "wrong",
    "incorrect",
    "that's wrong",
    "thats wrong",
    "not correct",
    "that's not right",
    "thats not right"
  ];

  return denialPhrases.some(p => lower.includes(p));
}
