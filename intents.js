function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .trim();
}

function includesAny(lower, phrases) {
  return phrases.some(p => lower.includes(p));
}

export function isEndingPhrase(text) {
  const lower = normalise(text);

  return includesAny(lower, [
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
    "thanks bye",
    "thank you bye",
    "that's me done",
    "thats me done",
    "i'm done",
    "im done"
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
    "space",
    "availability",
    "available",
    "free",
    "do you have",
    "have you got",
    "any tables",
    "is there room",
    "is there space",
    "can i come",
    "can we come",
    "fit us in",
    "fit me in",
    "come in tonight",
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
    "incorrect",
    "no"
  ])) {
    return false;
  }

  return includesAny(lower, [
    "yes",
    "yeah",
    "yep",
    "yeh",
    "yup",
    "correct",
    "right",
    "that's right",
    "thats right",
    "that's fine",
    "thats fine",
    "fine",
    "perfect",
    "go ahead",
    "book it",
    "put it down",
    "that works",
    "works for me",
    "sounds good",
    "all correct",
    "that's correct",
    "thats correct",
    "please do",
    "go for it",
    "that's okay",
    "thats okay",
    "ok",
    "okay"
  ]);
}

export function denies(text) {
  const lower = normalise(text);

  if (includesAny(lower, [
    "no problem",
    "no worries",
    "no thank you",
    "no thanks"
  ])) {
    return false;
  }

  return includesAny(lower, [
    "no",
    "nope",
    "nah",
    "not right",
    "not quite",
    "not correct",
    "wrong",
    "incorrect",
    "that's wrong",
    "thats wrong",
    "that's not right",
    "thats not right",
    "change it",
    "that's not it",
    "thats not it"
  ]);
}