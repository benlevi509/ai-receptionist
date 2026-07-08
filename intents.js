function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .trim();
}

function includesAny(text, phrases) {
  return phrases.some(phrase => text.includes(phrase));
}

export function isEndingPhrase(text) {
  const lower = normalise(text);

  return includesAny(lower, [
    "bye",
    "goodbye",
    "that's all",
    "thats all",
    "that's it",
    "thats it",
    "nothing else",
    "no thanks",
    "no thank you",
    "thanks bye",
    "thank you bye",
    "all good",
    "i'm done",
    "im done",
    "that's everything",
    "thats everything"
  ]);
}

export function isAiGoodbye(text) {
  const lower = normalise(text);

  return includesAny(lower, [
    "goodbye",
    "bye",
    "thanks for calling",
    "thank you for calling"
  ]);
}

export function wantsBooking(text) {
  const lower = normalise(text);

  return includesAny(lower, [
    "book",
    "booking",
    "reservation",
    "reserve",
    "table",
    "availability",
    "available",
    "space",
    "free table",
    "any tables",
    "have a table",
    "book a table",
    "come in today",
    "come in tomorrow"
  ]);
}

export function confirms(text) {
  const lower = normalise(text);

  if (includesAny(lower, [
    "not right",
    "not correct",
    "wrong",
    "incorrect"
  ])) {
    return false;
  }

  return includesAny(lower, [
    "yes",
    "yeah",
    "yep",
    "yeh",
    "yup",
    "ok",
    "okay",
    "correct",
    "that's right",
    "thats right",
    "that's correct",
    "thats correct",
    "sounds good",
    "that works",
    "works for me",
    "go ahead",
    "please do",
    "book it",
    "that's fine",
    "thats fine",
    "perfect",
    "absolutely",
    "sure"
  ]);
}

export function denies(text) {
  const lower = normalise(text);

  if (includesAny(lower, [
    "no problem",
    "no worries"
  ])) {
    return false;
  }

  return includesAny(lower, [
    "no",
    "nope",
    "nah",
    "wrong",
    "incorrect",
    "not right",
    "not correct",
    "change it",
    "change that",
    "that's wrong",
    "thats wrong",
    "that's not right",
    "thats not right"
  ]);
}