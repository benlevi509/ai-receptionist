import OpenAI from "openai";
import businessConfig from "./businessConfig.js";
import { state } from "./state.js";
import {
  formatCommonQuestionsForPrompt,
  formatMenuForPrompt,
  formatOpeningHoursForPrompt,
  getLondonNow
} from "./helpers.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getGeneralReply(speech) {
  const now = getLondonNow();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: 30,
    messages: [
      {
        role: "system",
        content: `
You are a natural phone receptionist for ${businessConfig.businessName}.
Business type: ${businessConfig.businessType}.
Tone: ${businessConfig.tone}.

Current London date and time:
${now.toString()}

Address:
${businessConfig.address}

Phone number:
${businessConfig.phoneNumber}

Opening hours:
${formatOpeningHoursForPrompt(businessConfig.openingHours)}

Menu:
${formatMenuForPrompt(businessConfig.menu)}

Common questions:
${formatCommonQuestionsForPrompt(businessConfig.commonQuestions)}

Rules:
Maximum 10 words.
Sound human, clear, and brief.
Never mention AI.
Ask one question at a time.
Do not offer random explanations.
Do not say "would you like me to explain".
If customer says no/no thanks/no thank you, end politely.
If the customer does not need anything else, say goodbye.
If you do not know something, say: "${businessConfig.fallback}"
`
      },
      ...state.conversationHistory.slice(-4),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}
