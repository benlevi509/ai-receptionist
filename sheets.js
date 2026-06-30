import { google } from "googleapis";
import fs from "fs";
import { TIME_ZONE } from "./helpers.js";

const SHEET_RANGE = "Sheet1!A:G";

function getGoogleCredentialsPath() {
  if (fs.existsSync("/etc/secrets/google-credentials.json")) {
    return "/etc/secrets/google-credentials.json";
  }

  return "google-credentials.json";
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: getGoogleCredentialsPath(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

export async function getExistingBookings() {
  try {
    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE
    });

    const rows = response.data.values || [];

    return rows.slice(1).map(row => ({
      date: row[3] || "",
      time: row[4] || ""
    }));
  } catch (error) {
    console.error("Failed to read bookings:", error);
    return [];
  }
}

export async function saveBookingToSheet(bookingData) {
  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error("Missing GOOGLE_SHEET_ID environment variable.");
      return;
    }

    const sheets = await getSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-GB", { timeZone: TIME_ZONE }),
          bookingData.name || "",
          bookingData.people || "",
          bookingData.date || "",
          bookingData.time || "",
          bookingData.phone || "",
          bookingData.notes || ""
        ]]
      }
    });

    console.log("Booking saved to Google Sheets.");
  } catch (error) {
    console.error("Failed to save booking to Google Sheets:", error);
  }
}
