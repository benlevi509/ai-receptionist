function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function sayAndGather(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>

<Gather
    input="speech"
    timeout="10"
    speechTimeout="1.2"
    action="/process-speech"
    method="POST">
</Gather>

<Say voice="Polly.Brian" language="en-GB">
Sorry, I didn't catch that.
</Say>

<Gather
    input="speech"
    timeout="20"
    speechTimeout="1.2"
    action="/process-speech"
    method="POST">
</Gather>

<Say voice="Polly.Brian" language="en-GB">
Thanks for calling. Goodbye.
</Say>

<Pause length="1"/>
<Hangup/>
</Response>
`;
}

export function sayAndHangup(reply) {
  return `
<Response>
<Say voice="Polly.Brian" language="en-GB">${escapeXml(reply)}</Say>
<Pause length="1"/>
<Hangup/>
</Response>
`;
}
