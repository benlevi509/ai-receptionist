import express from "express";
import bodyParser from "body-parser";
import businessConfig from "./businessConfig.js";

import { state, resetState } from "./state.js";
import { sayAndGather, sayAndHangup } from "./twilio.js";
import { getGeneralReply } from "./ai.js";
import { handleBooking } from "./booking.js";
import { isAiGoodbye, isEndingPhrase, wantsBooking } from "./intents.js";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health checks help stop the Render server going fully cold
app.get("/", (req, res) => {
  res.send(`${businessConfig.businessName} AI receptionist is live.`);
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/test-ai", (req, res) => {
  res.send(`${businessConfig.businessName} AI receptionist is running.`);
});

app.post("/voice", (req, res) => {
  resetState();

  res.type("text/xml");
  res.send(sayAndGather(businessConfig.greeting));
});

app.post("/process-speech", async (req, res) => {
  const speech = (req.body.SpeechResult || "").trim();

  res.type("text/xml");

  // Better silence handling
  if (!speech) {
    state.silenceCount = (state.silenceCount || 0) + 1;

    if (state.silenceCount === 1) {
      const prompt = state.bookingActive
        ? "Are you still there?"
        : "Is there anything else I can help you with?";

      res.send(sayAndGather(prompt));
      return;
    }

    res.send(
      sayAndHangup(
        "I still can't hear anything, so I'll end the call now. Thanks for calling. Goodbye."
      )
    );
    return;
  }

  state.silenceCount = 0;

  if (isEndingPhrase(speech)) {
    res.send(sayAndHangup("No problem. Thanks for calling. Goodbye."));
    return;
  }

  let reply = "";

  try {
    if (state.bookingActive || wantsBooking(speech)) {
      state.bookingActive = true;

      if (!state.bookingStep) {
        state.bookingStep = "people";
      }

      reply = await handleBooking(speech);
    } else {
      reply = await getGeneralReply(speech);
    }
  } catch (error) {
    console.error("Error in /process-speech:", error);
    reply = "Sorry, something went wrong. Could you say that again?";
  }

  state.conversationHistory.push({ role: "user", content: speech });
  state.conversationHistory.push({ role: "assistant", content: reply });

  if (isAiGoodbye(reply)) {
    res.send(sayAndHangup(reply));
  } else {
    res.send(sayAndGather(reply));
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`${businessConfig.businessName} server running on port ${PORT}`);
});
