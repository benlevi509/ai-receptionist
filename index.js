import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import OpenAI from "openai";

import { restaurant } from "./restaurant.js";
import { createCallMemory, getCallMemory } from "./memory.js";
import { createSlot, isSlotFull, addBooking } from "./booking.js";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/* ---------- OpenAI ---------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- AI System Prompt ---------- */

const SYSTEM_PROMPT = `
You are the professional phone receptionist for ${restaurant.name}.

Restaurant details:
Address: ${restaurant.address}
Cuisine: ${restaurant.cuisine}

Your job is to help customers with:
- table bookings
- opening hours
- takeaway orders
- general questions about the restaurant

Rules:
- Speak clearly and politely
- Keep answers short (1–2 sentences)
- Ask follow-up questions if information is missing

If a customer wants to make a booking, ask for:
- number of people
- date
- time
- name

Always sound friendly and professional.
`;

/* ---------- Call Memory Storage ---------- */

const callMemories = {};

/* ---------- Test Route ---------- */

app.get("/test-ai", async (req, res) => {

  try {

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "Hello" }
      ]
    });

    res.send(response.choices[0].message.content);

  } catch (error) {

    console.error(error);
    res.status(500).send("AI test failed");

  }

});

/* ---------- Voice Route ---------- */

app.post("/voice", (req, res) => {

  const callSid = req.body.CallSid;

  /* create memory for this call */

  createCallMemory(callSid);

  callMemories[callSid] = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  const twiml = `
<Response>

<Say voice="Polly.Joanna">
Hello, thank you for calling ${restaurant.name}. How can I help you today?
</Say>

<Gather input="speech" action="/process-speech" method="POST">

<Say voice="Polly.Joanna">
Please tell me how I can help.
</Say>

</Gather>

</Response>
`;

  res.type("text/xml");
  res.send(twiml);

});

/* ---------- Process Speech ---------- */

app.post("/process-speech", async (req, res) => {

  const speech = req.body.SpeechResult;
  const callSid = req.body.CallSid;

  if (!callMemories[callSid]) {

    createCallMemory(callSid);

    callMemories[callSid] = [
      { role: "system", content: SYSTEM_PROMPT }
    ];

  }

  const memory = getCallMemory(callSid);

  callMemories[callSid].push({
    role: "user",
    content: speech
  });

  try {

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: callMemories[callSid]
    });

    const reply = aiResponse.choices[0].message.content;

    callMemories[callSid].push({
      role: "assistant",
      content: reply
    });

    const twiml = `
<Response>

<Say voice="Polly.Joanna">
${reply}
</Say>

<Gather input="speech" action="/process-speech" method="POST">

<Say voice="Polly.Joanna">
Is there anything else I can help you with?
</Say>

</Gather>

</Response>
`;

    res.type("text/xml");
    res.send(twiml);

  } catch (error) {

    console.error(error);

    const twiml = `
<Response>
<Say>Sorry, something went wrong. Please try again.</Say>
</Response>
`;

    res.type("text/xml");
    res.send(twiml);

  }

});

/* ---------- Server ---------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
