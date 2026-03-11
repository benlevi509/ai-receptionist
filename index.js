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

const twiml = `
<Response>
<Say voice="alice">Hello. This is the AI receptionist.</Say>
</Response>
`;

res.type("text/xml");
res.send(twiml);

});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log("Server running");
});
