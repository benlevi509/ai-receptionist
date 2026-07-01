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

<Say voice="Polly.Brian" language="en-GB">
${escapeXml(reply)}
</Say>

<Gather
    input="speech"
    action="/process-speech"
    method="POST"
    language="en-GB"
    speechModel="phone_call"
    speechTimeout="auto"
    timeout="8"
    enhanced="true">
</Gather>

<Say voice="Polly.Brian" language="en-GB">
Are you still there?
</Say>

<Gather
    input="speech"
    action="/process-speech"
    method="POST"
    language="en-GB"
    speechModel="phone_call"
    speechTimeout="1"
    timeout="8"
    enhanced="true">
</Gather>

<Say voice="Polly.Brian" language="en-GB">
I'll end the call now. Thank you for calling ${escapeXml(
  "the restaurant"
)}. Goodbye.
</Say>

<Pause length="1"/>
<Hangup/>

</Response>
`;
}

export function sayAndHangup(reply) {
  return `
<Response>

<Say voice="Polly.Brian" language="en-GB">
${escapeXml(reply)}
</Say>

<Pause length="1"/>

<Hangup/>

</Response>
`;
}
