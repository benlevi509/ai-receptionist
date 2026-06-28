import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- CURRENT DATE + TIME ---------- */

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

/* ---------- XML SAFETY ---------- */

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ---------- SYSTEM PROMPT ---------- */

function getSystemPrompt() {
  const currentDateTime = getCurrentDateTime();

  return `
You are the warm, natural phone receptionist for Benji's Restaurant.

Current date and time: ${currentDateTime}

Voice style:
- Speak clearly, calmly, and naturally.
- Sound like a real human receptionist, not a bot.
- Keep replies short and smooth.
- Maximum 14 words per reply.
- Ask ONE question at a time.
- Never say "how are you".
- Never speak in paragraphs.
- Never repeat the exact same sentence.
- Do not overuse "of course".
- Vary your wording naturally.
- Use contractions sometimes, like "that's" and "we'll".
- If the caller asks a question, answer briefly first.

Opening style:
Use natural options like:
"Would you like to make a reservation, ask about the menu, or something else?"

Booking information required:
1. number of guests
2. date
3. time
4. name

Booking flow:
- Ask smoothly, one detail at a time.
- Once all booking details are collected, confirm the booking briefly.
- After confirming, ask something like:
"Is there anything else I can help with?"

Booking date wording:
- If the booking is today, say "today".
- If tomorrow, say "tomorrow".
- Otherwise say the weekday and date only.
- Never say the year.
- Never say long formal dates.

Ending calls:
If the caller says anything like:
"that'll be all", "that's all", "thank you", "no thanks", "nothing else", "bye"
then politely close the call.

Good closing examples:
"Perfect, thank you. Have a great day."
"Lovely, thanks for calling. Have a great day."
"No problem, have a great day."

Never mention AI.
Never say you are checking a database.
Never promise anything unrealistic.
Never speak more than one sentence.
`;
}

let conversationHistory = [
  { role: "system", content: getSystemPrompt() }
];

/* ---------- FAST AI FUNCTION ---------- */

async function getFastAIReply() {
  const recentMessages = [
    { role: "system", content: getSystemPrompt() },
    ...conversationHistory.slice(-8)
  ];

  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.55,
    max_tokens: 45,
    messages: recentMessages
  });

  return aiResponse.choices[0].message.content.trim();
}

/* ---------- TEST AI ---------- */

app.get("/test-ai", async (req, res) => {
  try {
    const reply = await getFastAIReply();
    res.send(reply);
  } catch (error) {
    console.error(error);
    res.send("AI test failed.");
  }
});

/* ---------- VOICE ROUTE ---------- */

app.post("/voice", (req, res) => {
  conversationHistory = [
    { role: "system", content: getSystemPrompt() }
  ];

  const twiml = `
<Response>

<Say voice="alice" language="en-GB">Hello, welcome to Benji's Restaurant. Would you like to make a reservation, ask about the menu, or something else?</Say>

<Gather input="speech"
timeout="6"
speechTimeout="auto"
action="/process-speech"
method="POST">
</Gather>

<Say voice="alice" language="en-GB">Sorry, are you still there?</Say>

<Gather input="speech"
timeout="5"
speechTimeout="auto"
action="/process-speech"
method="POST">
</Gather>

<Say voice="alice" language="en-GB">Thanks for calling. Have a great day.</Say>
<Hangup/>

</Response>
`;

  res.type("text/xml");
  res.send(twiml);
});

/* ---------- PROCESS SPEECH ---------- */

app.post("/process-speech", async (req, res) => {
  const speech = req.body.SpeechResult || "";
  const lowerSpeech = speech.toLowerCase();

  const endingPhrases = [
    "bye",
    "goodbye",
    "that'll be all",
    "that will be all",
    "thats all",
    "that's all",
    "nothing else",
    "no thanks",
    "no thank you",
    "thank you bye",
    "thanks bye"
  ];

  if (endingPhrases.some(phrase => lowerSpeech.includes(phrase))) {
    const twiml = `
<Response>
<Say voice="alice" language="en-GB">Perfect, thank you. Have a great day.</Say>
<Hangup/>
</Response>
`;

    res.type("text/xml");
    res.send(twiml);
    return;
  }

  conversationHistory.push({
    role: "user",
    content: speech
  });

  try {
    const reply = await getFastAIReply();

    conversationHistory.push({
      role: "assistant",
      content: reply
    });

    const safeReply = escapeXml(reply);

    const twiml = `
<Response>

<Say voice="alice" language="en-GB">${safeReply}</Say>

<Gather input="speech"
timeout="6"
speechTimeout="auto"
action="/process-speech"
method="POST">
</Gather>

<Say voice="alice" language="en-GB">Sorry, are you still there?</Say>

<Gather input="speech"
timeout="5"
speechTimeout="auto"
action="/process-speech"
method="POST">
</Gather>

<Say voice="alice" language="en-GB">Thanks for calling. Have a great day.</Say>
<Hangup/>

</Response>
`;

    res.type("text/xml");
    res.send(twiml);

  } catch (error) {
    console.error(error);

    const twiml = `
<Response>
<Say voice="alice" language="en-GB">Sorry, could you say that again please?</Say>
<Gather input="speech"
timeout="6"
speechTimeout="auto"
action="/process-speech"
method="POST">
</Gather>
</Response>
`;

    res.type("text/xml");
    res.send(twiml);
  }
});

/* ---------- SERVER ---------- */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
