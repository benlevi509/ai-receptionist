import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- AI PROMPT ---------- */

const SYSTEM_PROMPT = `
You are the receptionist for Benji's Restaurant.

Speak like a calm, friendly human receptionist.

Rules:

- Keep answers short.
- Ask only ONE question at a time.
- Never ask for multiple booking details at once.

If someone wants a booking, collect information step by step:

1. number of people
2. date
3. time
4. name

Example conversation:

Customer: I'd like to book a table.

You: Of course. How many people will be dining?

Customer answers.

You: Great. What date were you thinking of?

Customer answers.

You: And roughly what time?

Customer answers.

You: Perfect. Could I take the name for the booking?

Be natural and polite.
`;

/* ---------- MEMORY ---------- */

let conversationHistory = [
  { role: "system", content: SYSTEM_PROMPT }
];

/* ---------- TEST ROUTE ---------- */

app.get("/test-ai", async (req, res) => {

  try {

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory
    });

    res.send(response.choices[0].message.content);

  } catch (error) {

    console.error(error);
    res.status(500).send("AI test failed");

  }

});

/* ---------- INCOMING CALL ---------- */

app.post("/voice", (req, res) => {

conversationHistory = [
  { role: "system", content: SYSTEM_PROMPT }
];

const twiml = `
<Response>

<Say>Hello, thank you for calling Benji's Restaurant.</Say>

<Gather
input="speech"
action="https://ai-receptionist-iopm.onrender.com/process-speech"
method="POST"
timeout="10"
speechTimeout="auto">

<Say>How can I help today?</Say>

</Gather>

<Say>Sorry, I didn't hear anything. Are you still there?</Say>

<Gather
input="speech"
action="https://ai-receptionist-iopm.onrender.com/process-speech"
method="POST"
timeout="10"
speechTimeout="auto">

<Say>Please let me know how I can help.</Say>

</Gather>

<Say>Okay, feel free to call us again if you need anything. Goodbye.</Say>

</Response>
`;

res.type("text/xml");
res.send(twiml);

});

/* ---------- PROCESS SPEECH ---------- */

app.post("/process-speech", async (req, res) => {

const speech = req.body.SpeechResult;

conversationHistory.push({
role: "user",
content: speech
});

try {

const aiResponse = await openai.chat.completions.create({
model: "gpt-4o-mini",
messages: conversationHistory
});

const reply = aiResponse.choices[0].message.content;

conversationHistory.push({
role: "assistant",
content: reply
});

const twiml = `
<Response>

<Say>${reply}</Say>

<Gather
input="speech"
action="https://ai-receptionist-iopm.onrender.com/process-speech"
method="POST"
timeout="10"
speechTimeout="auto">

<Say>Go ahead.</Say>

</Gather>

<Say>Thanks for calling Benji's Restaurant. Goodbye.</Say>

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

/* ---------- SERVER ---------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log("Server running on port " + PORT);
});
