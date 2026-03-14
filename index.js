import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";
import OpenAI from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/* ---------- OpenAI ---------- */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- Twilio ---------- */

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* ---------- Test Route ---------- */

app.get("/test-ai", async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a friendly restaurant receptionist."
        },
        {
          role: "user",
          content: "Hello"
        }
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

const twiml = `
<Response>
<Say>Hello, thank you for calling. How can I help you today?</Say>

<Gather input="speech" action="/process-speech" method="POST">
<Say>Please tell me how I can help.</Say>
</Gather>

</Response>
`;

res.type("text/xml");
res.send(twiml);

});
/* ---------- Server ---------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
