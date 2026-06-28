import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let conversationHistory = [];
let booking = {};
let bookingActive = false;

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanDate(text) {
  let lower = text.toLowerCase();

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];

  for (const month of months) {
    const regex = new RegExp(`(\\d{1,2})(st|nd|rd|th)?\\s+(of\\s+)?${month}`, "i");
    const match = lower.match(regex);

    if (match) {
      return `${match[1]}${match[2] || "th"} of ${month.charAt(0).toUpperCase() + month.slice(1)}`;
    }
  }

  if (lower.includes("today")) return "today";
  if (lower.includes("tomorrow")) return "tomorrow";

  return text.trim();
}

function extractPeople(text) {
  const lower = text.toLowerCase();
  const numberMatch = lower.match(/\b(\d+)\b/);

  if (numberMatch) return `${numberMatch[1]} people`;

  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };

  for (const word in words) {
    if (lower.includes(word)) return `${words[word]} people`;
  }

  return null;
}

function extractTime(text) {
  const lower = text.toLowerCase();

  if (lower.includes("half seven")) return "7:30";
  if (lower.includes("half six")) return "6:30";
  if (lower.includes("half eight")) return "8:30";
  if (lower.includes("half nine")) return "9:30";

  const timeMatch = lower.match(/\b(\d{1,2})(:\d{2})?\s*(pm|am)?\b/);

  if (timeMatch) {
    let time = timeMatch[1] + (timeMatch[2] || "");
    if (timeMatch[3]) time += timeMatch[3];
    else time += "pm";
    return time;
  }

  return null;
}

function isEndingPhrase(text) {
  const lower = text.toLowerCase();

  return [
    "bye",
    "goodbye",
    "that'll be all",
    "that will be all",
    "that's all",
    "thats all",
    "nothing else",
    "no thanks",
    "no thank you",
    "all good",
    "that's everything",
    "thank you bye",
    "thanks bye"
  ].some(p => lower.includes(p));
}

function wantsBooking(text) {
  const lower = text.toLowerCase();

  return [
    "book",
    "booking",
    "reservation",
    "reserve",
    "table"
  ].some(p => lower.includes(p));
}

function sayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Gather input="speech" timeout="3" speechTimeout="1" action="/process-speech" method="POST">
</Gather>
<Say voice="Polly.Brian" language="en-GB">Sorry, I didn't catch that.</Say>
<Gather input="speech" timeout="3" speechTimeout="1" action="/process-speech" method="POST">
</Gather>
<Say voice="Polly.Brian" language="en-GB">Thanks for calling. Have a great day.</Say>
<Hangup/>
</Response>
`;
}

function sayAndHangup(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Hangup/>
</Response>
`;
}

async function getGeneralReply(speech) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.45,
    max_tokens: 35,
    messages: [
      {
        role: "system",
        content: `
You are a clear, natural phone receptionist for Benji's Restaurant.
Maximum 12 words.
Sound relaxed and human.
Do not sound posh or robotic.
Do not overuse "of course".
Ask one question at a time.
Never mention AI.
`
      },
      ...conversationHistory.slice(-4),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}

function handleBooking(speech) {
  const lower = speech.toLowerCase();

  const people = extractPeople(speech);
  const time = extractTime(speech);
  const date = cleanDate(speech);

  if (people && !booking.people) booking.people = people;

  if (
    (lower.includes("january") || lower.includes("february") || lower.includes("march") ||
     lower.includes("april") || lower.includes("may") || lower.includes("june") ||
     lower.includes("july") || lower.includes("august") || lower.includes("september") ||
     lower.includes("october") || lower.includes("november") || lower.includes("december") ||
     lower.includes("today") || lower.includes("tomorrow")) &&
    !booking.date
  ) {
    booking.date = date;
  }

  if (time && !booking.time && !lower.includes("people")) booking.time = time;

  if (!booking.people) {
    return "Sure, how many people is the table for?";
  }

  if (!booking.date) {
    return "Great, what date would you like?";
  }

  if (!booking.time) {
    return `Yes, ${booking.date} should be fine. What time would you like?`;
  }

  if (!booking.name) {
    booking.name = speech.trim();
    return `Perfect, table for ${booking.people} on ${booking.date} at ${booking.time}, under ${booking.name}. Anything else I can help with?`;
  }

  bookingActive = false;
  return "Anything else I can help with?";
}

app.get("/test-ai", (req, res) => {
  res.send("AI receptionist is running.");
});

app.post("/voice", (req, res) => {
  conversationHistory = [];
  booking = {};
  bookingActive = false;

  res.type("text/xml");
  res.send(
    sayAndGather(
      "Hello, welcome to Benji's Restaurant. Would you like to make a reservation, ask about the menu, or is there something else I can help with?"
    )
  );
});

app.post("/process-speech", async (req, res) => {
  const speech = req.body.SpeechResult || "";

  if (!speech.trim()) {
    res.type("text/xml");
    res.send(sayAndGather("Sorry, could you say that again?"));
    return;
  }

  if (isEndingPhrase(speech)) {
    res.type("text/xml");
    res.send(sayAndHangup("Perfect, thanks for calling. Have a great day."));
    return;
  }

  let reply = "";

  try {
    if (bookingActive || wantsBooking(speech)) {
      bookingActive = true;
      reply = handleBooking(speech);
    } else {
      reply = await getGeneralReply(speech);
    }
  } catch (error) {
    console.error(error);
    reply = "Sorry, could you say that again?";
  }

  conversationHistory.push({ role: "user", content: speech });
  conversationHistory.push({ role: "assistant", content: reply });

  res.type("text/xml");
  res.send(sayAndGather(reply));
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
