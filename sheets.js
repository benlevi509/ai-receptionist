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

function cleanCell(value) {
  return String(value || "").trim();
}

export async function getExistingBookings() {
  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error("Missing GOOGLE_SHEET_ID environment variable.");
      return [];
    }

    const sheets = await getSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE
    });

    const rows = response.data.values || [];

    return rows
      .slice(1)
      .filter(row => row && row.length)
      .map(row => ({
        createdAt: cleanCell(row[0]),
        name: cleanCell(row[1]),
        people: cleanCell(row[2]),
        date: cleanCell(row[3]),
        time: cleanCell(row[4]),
        phone: cleanCell(row[5]),
        notes: cleanCell(row[6])
      }))
      .filter(booking => booking.date && booking.time);
  } catch (error) {
    console.error("Failed to read bookings from Google Sheets:", error.message || error);
    return [];
  }
}

export async function saveBookingToSheet(bookingData) {
  try {
    if (!process.env.GOOGLE_SHEET_ID) {
      console.error("Missing GOOGLE_SHEET_ID environment variable.");
      return false;
    }

    if (!bookingData?.date || !bookingData?.time || !bookingData?.people || !bookingData?.name) {
      console.error("Incomplete booking data, not saving:", bookingData);
      return false;
    }

    const sheets = await getSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-GB", { timeZone: TIME_ZONE }),
          bookingData.name,
          bookingData.people,
          bookingData.date,
          bookingData.time,
          bookingData.phone || "",
          bookingData.notes || ""
        ]]
      }
    });

    console.log("Booking saved to Google Sheets.");
    return true;
  } catch (error) {
    console.error("Failed to save booking to Google Sheets:", error.message || error);
    return false;
  }
}
