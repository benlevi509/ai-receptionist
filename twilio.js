function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function mediaStreamResponse(host, { callerNumber = "", callSid = "" } = {}) {
  const cleanHost = String(host || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "")
    .replace(/\/$/, "");

  if (!cleanHost) throw new Error("Cannot create Twilio media stream without a public host.");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${escapeXml(cleanHost)}/media-stream">
      <Parameter name="callerNumber" value="${escapeXml(callerNumber)}" />
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
    </Stream>
  </Connect>
</Response>`;
}
