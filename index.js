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

app.get("/", (req, res) => {
  res.status(200).send(`${businessConfig.businessName} AI receptionist is live.`);
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/test-ai", (req, res) => {
  res.status(200).send(`${businessConfig.businessName} AI receptionist is running.`);
});

app.post("/voice", (req, res) => {
  resetState();

  res.type("text/xml");
  res.send(sayAndGather(businessConfig.greeting));
});

app.post("/process-speech", async (req, res) => {
  res.type("text/xml");

  const speech = String(req.body.SpeechResult || "").trim();

  if (!speech) {
    state.silenceCount = (state.silenceCount || 0) + 1;

    if (state.silenceCount === 1) {
      const prompt = state.bookingActive
        ? "Sorry, I didn’t quite catch that. Could you say that again?"
        : "Sorry, I didn’t hear anything there. How can I help?";

      return res.send(sayAndGather(prompt));
    }

    if (state.silenceCount === 2) {
      return res.send(
        sayAndGather("Are you still there?")
      );
    }

    return res.send(
      sayAndHangup(
        `I still can’t hear anything, so I’ll end the call for now. Thanks for calling ${businessConfig.businessName}. Goodbye.`
      )
    );
  }

  state.silenceCount = 0;

  if (isEndingPhrase(speech)) {
    return res.send(
      sayAndHangup(`No problem. Thanks for calling ${businessConfig.businessName}. Goodbye.`)
    );
  }

  let reply;

  try {
    const shouldUseBookingFlow = state.bookingActive || wantsBooking(speech);

    if (shouldUseBookingFlow) {
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

    reply = "Sorry, something went wrong there. Could you say that again?";
  }

  state.conversationHistory.push({ role: "user", content: speech });
  state.conversationHistory.push({ role: "assistant", content: reply });

  if (state.conversationHistory.length > 12) {
    state.conversationHistory = state.conversationHistory.slice(-12);
  }

  if (isAiGoodbye(reply)) {
    return res.send(sayAndHangup(reply));
  }

  return res.send(sayAndGather(reply));
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`${businessConfig.businessName} server running on port ${PORT}`);
});
