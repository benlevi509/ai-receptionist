import businessConfig from "./businessConfig.js";

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function mediaStreamResponse(host, callerNumber = "") {
  const cleanHost = String(host || "")
    .replace(/^https?:\/\//, "")
    .replace(/^wss?:\/\//, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${escapeXml(cleanHost)}/media-stream">
      <Parameter name="callerNumber" value="${escapeXml(callerNumber)}" />
    </Stream>
  </Connect>
</Response>`;
}

// Kept as a simple fallback/debug helper while the realtime bridge is rolled out.
export function sayAndGather(reply) {
  return `<Response><Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say></Response>`;
}

export function sayAndHangup(reply) {
  return `<Response><Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say><Hangup/></Response>`;
}

export { businessConfig };
