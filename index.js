import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: false }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/voice", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>Hello! This is the AI receptionist. How can I help?</Say>
      <Gather input="speech" action="/respond" method="POST" />
    </Response>
  `);
});

app.post("/respond", async (req, res) => {
  const userSaid = req.body.SpeechResult || "";

  if (!userSaid.trim()) {
    res.type("text/xml");
    return res.send(`
      <Response>
        <Say>Sorry, I didn't catch that. Please say it again.</Say>
        <Gather input="speech" action="/respond" method="POST" />
      </Response>
    `);
  }

  const ai = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "You are a polite professional AI receptionist. Keep replies short and ask one follow-up question."
      },
      { role: "user", content: userSaid }
    ]
  });

  const reply = ai.output_text || "Sorry, can you repeat that?";

  res.type("text/xml");
  res.send(`
    <Response>
      <Say>${reply}</Say>
      <Gather input="speech" action="/respond" method="POST" />
    </Response>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
