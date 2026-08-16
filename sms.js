import twilio from "twilio";
import businessConfig from "./businessConfig.js";

export async function sendBookingNotification({ people, date, time, name, phone }) {
  const to = businessConfig.bookingSettings?.notificationPhoneNumber;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!to || !from || !accountSid || !authToken) {
    console.warn("Booking SMS skipped: Twilio SMS configuration is incomplete.");
    return false;
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      to,
      from,
      body: `New booking - ${businessConfig.businessName}\n${name}\n${people} people\n${date} at ${time}\nCustomer: ${phone || "Number unavailable"}`
    });
    return true;
  } catch (error) {
    console.error("Booking SMS failed:", error?.message || error);
    return false;
  }
}
