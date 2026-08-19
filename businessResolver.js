import businessConfig from "./businessConfig.js";

const callBusinessConfigs = new Map();
const TABLE_CANDIDATES = [
  process.env.SUPABASE_BUSINESSES_TABLE,
  "businesses",
  "AI Receptionist"
].filter(Boolean);

function mergeBusinessProfile(row = {}) {
  const config = structuredClone(businessConfig);

  if (row.business_name) config.businessName = String(row.business_name).trim();
  if (row.greeting) config.greeting = String(row.greeting).trim();
  if (row.business_address) config.address = String(row.business_address).trim();
  if (row.opening_hours && typeof row.opening_hours === "object") config.openingHours = row.opening_hours;
  if (row.menu && typeof row.menu === "object") config.menu = row.menu;

  const maxParty = Number(row.max_booking_size);
  if (Number.isInteger(maxParty) && maxParty > 0) {
    config.bookingSettings.maximumPartySize = maxParty;
  }

  if (row.sms_recipient_number) {
    config.bookingSettings.notificationPhoneNumber = String(row.sms_recipient_number).trim();
  }

  config.backend = {
    source: "supabase",
    businessInstructions: String(row.business_instructions || "").trim(),
    bookingRules: String(row.booking_rules || "").trim(),
    timezone: String(row.timezone || "Europe/London").trim(),
    twilioPhoneNumber: String(row.twilio_phone_number || "").trim()
  };

  return config;
}

async function fetchBusinessRow(calledNumber) {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!baseUrl || !secretKey || !calledNumber) return null;

  for (const table of TABLE_CANDIDATES) {
    try {
      const url = new URL(`${baseUrl}/rest/v1/${encodeURIComponent(table)}`);
      url.searchParams.set("select", "*");
      url.searchParams.set("twilio_phone_number", `eq.${calledNumber}`);
      url.searchParams.set("limit", "1");

      const response = await fetch(url, {
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(2500)
      });

      if (!response.ok) continue;
      const rows = await response.json();
      if (Array.isArray(rows) && rows[0]) return rows[0];
    } catch (error) {
      console.warn(`Supabase business lookup failed for table ${table}:`, error.message || error);
    }
  }

  return null;
}

export async function resolveBusinessForCall(callSid, calledNumber) {
  let resolved = businessConfig;
  try {
    const row = await fetchBusinessRow(calledNumber);
    if (row && row.active !== false) {
      resolved = mergeBusinessProfile(row);
      console.log(`Loaded business profile from Supabase: ${resolved.businessName}`);
    } else {
      console.warn(`No active Supabase business profile found for ${calledNumber || "unknown number"}; using code fallback.`);
    }
  } catch (error) {
    console.warn("Business profile resolution failed; using code fallback:", error.message || error);
  }

  if (callSid) callBusinessConfigs.set(callSid, resolved);
  return resolved;
}

export function getBusinessForCall(callSid) {
  return callBusinessConfigs.get(callSid) || businessConfig;
}

export function releaseBusinessForCall(callSid) {
  if (callSid) callBusinessConfigs.delete(callSid);
}
