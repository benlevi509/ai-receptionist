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

app.get("/test-ai", (req, res) => {
  res.send(`${businessConfig.businessName} AI receptionist is running.`);
});

app.post("/voice", (req, res) => {
  resetState();

  res.type("text/xml");
  res.send(sayAndGather(businessConfig.greeting));
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
    console.error(error);
    reply = "Sorry, something went wrong. Could you repeat that?";
  }

  state.conversationHistory.push({ role: "user", content: speech });
  state.conversationHistory.push({ role: "assistant", content: reply });

  res.type("text/xml");

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
