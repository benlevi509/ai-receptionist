import express from "express";
import bodyParser from "body-parser";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post("/voice", async (req, res) => {

  const caller = req.body.From;

  await client.messages.create({
    body: "Sorry we missed your call. How can we help?",
    from: process.env.TWILIO_PHONE_NUMBER,
    to: caller
  });

  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Sorry we missed your call. We've sent you a text message.");

  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
