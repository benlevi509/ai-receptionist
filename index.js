import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function getCurrentDateTime() {
  const now = new Date();
  return now.toLocaleString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let conversationHistory = [];
let booking = {};
let bookingStep = null;

function getSystemPrompt() {
  return `
You are a clear, natural phone receptionist for Benji's Restaurant.

Current date and time: ${getCurrentDateTime()}

Rules:
- Maximum 12 words per reply.
- Sound casual, clear, and human.
- Do not sound posh, formal, robotic, or overly cheerful.
- Do not overuse "of course".
- Vary your wording.
- Ask one question at a time.
- Never say "how are you".
- Never mention AI.
- Never speak in paragraphs.

Booking wording:
Say "How many people is the table for?"
Do not say "guests joining you".

After a booking is confirmed, ask:
"Anything else I can help with?"

If the caller is finished, say:
"Perfect, thanks for calling. Have a great day."
`;
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
    "thank you",
    "thanks"
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

function twilioSayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Gather input="speech" timeout="4" speechTimeout="1" action="/process-speech" method="POST">
</Gather>
<Say voice="Polly.Brian" language="en-GB">Sorry, I didn't catch that.</Say>
<Gather input="speech" timeout="4" speechTimeout="1" action="/process-speech" method="POST">
</Gather>
<Say voice="Polly.Brian" language="en-GB">Thanks for calling. Have a great day.</Say>
<Hangup/>
</Response>
`;
}

function twilioSayAndHangup(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Hangup/>
</Response>
`;
}

async function getAIReply(speech) {
  const messages = [
    { role: "system", content: getSystemPrompt() },
    ...conversationHistory.slice(-6),
    { role: "user", content: speech }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.45,
    max_tokens: 35,
    messages
  });

  return response.choices[0].message.content.trim();
}

app.get("/test-ai", async (req, res) => {
  res.send("AI receptionist is running.");
});

app.post("/voice", (req, res) => {
  conversationHistory = [];
  booking = {};
  bookingStep = null;

  const twiml = twilioSayAndGather(
    "Hello, Benji's Restaurant. Would you like to make a reservation, ask about the menu, or something else?"
  );

  res.type("text/xml");
  res.send(twiml);
});

app.post("/process-speech", async (req, res) => {
  const speech = req.body.SpeechResult || "";

  if (!speech.trim()) {
    res.type("text/xml");
    res.send(twilioSayAndGather("Sorry, could you say that again?"));
    return;
  }

  if (isEndingPhrase(speech)) {
    res.type("text/xml");
    res.send(twilioSayAndHangup("Perfect, thanks for calling. Have a great day."));
    return;
  }

  let reply = "";

  if (wantsBooking(speech) && !bookingStep) {
    bookingStep = "people";
    reply = "Sure, how many people is the table for?";
  } else if (bookingStep === "people") {
    booking.people = speech;
    bookingStep = "date";
    reply = "Great, what date would you like?";
  } else if (bookingStep === "date") {
    booking.date = speech;
    bookingStep = "time";
    reply = "And what time would you like?";
  } else if (bookingStep === "time") {
    booking.time = speech;
    bookingStep = "name";
    reply = "Lovely, what name should I put it under?";
  } else if (bookingStep === "name") {
    booking.name = speech;
    bookingStep = "complete";
    reply = `Perfect, table for ${booking.people} on ${booking.date} at ${booking.time} under ${booking.name}. Anything else I can help with?`;
  } else {
    try {
      reply = await getAIReply(speech);
    } catch (error) {
      console.error(error);
      reply = "Sorry, could you say that again?";
    }
  }

  conversationHistory.push({ role: "user", content: speech });
  conversationHistory.push({ role: "assistant", content: reply });

  res.type("text/xml");
  res.send(twilioSayAndGather(reply));
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
