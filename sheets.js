import { google } from "googleapis";
import fs from "fs";

import { TIME_ZONE } from "./helpers.js";

const SHEET_RANGE = "Sheet1!A:G";
const GOOGLE_REQUEST_TIMEOUT_MS = 6000;
let sheetsClientPromise = null;

function getGoogleCredentialsPath() {
  if (fs.existsSync("/etc/secrets/google-credentials.json")) {
    return "/etc/secrets/google-credentials.json";
  }
  return "google-credentials.json";
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const auth = new google.auth.GoogleAuth({
        keyFile: getGoogleCredentialsPath(),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });
      return google.sheets({ version: "v4", auth });
    })();
  }

  try {
    return await sheetsClientPromise;
  } catch (error) {
    // Do not permanently cache a failed initialisation.
    sheetsClientPromise = null;
    throw error;
  }
}

function cleanCell(value) {
  return String(value || "").trim();
}

function requireSheetId() {
  const sheetId = String(process.env.GOOGLE_SHEET_ID || "").trim();
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID environment variable.");
  return sheetId;
}

export async function getExistingBookings() {
  const spreadsheetId = requireSheetId();

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get(
      {
        spreadsheetId,
        range: SHEET_RANGE
      },
      { timeout: GOOGLE_REQUEST_TIMEOUT_MS }
    );

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
    throw new Error("Booking storage is temporarily unavailable.", { cause: error });
  }
}

export async function saveBookingToSheet(bookingData) {
  let spreadsheetId;
  try {
    spreadsheetId = requireSheetId();
  } catch (error) {
    console.error(error.message || error);
    return false;
  }

  if (!bookingData?.date || !bookingData?.time || !bookingData?.people || !bookingData?.name) {
    console.error("Incomplete booking data, not saving.");
    return false;
  }

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append(
      {
        spreadsheetId,
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
      },
      { timeout: GOOGLE_REQUEST_TIMEOUT_MS }
    );

    console.log("Booking saved to Google Sheets.");
    return true;
  } catch (error) {
    console.error("Failed to save booking to Google Sheets:", error.message || error);
    return false;
  }
}
