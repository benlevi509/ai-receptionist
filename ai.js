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
    temperature: 0.2,
    max_tokens: 55,
    messages: [
      {
        role: "system",
        content: `
You are a professional phone receptionist for ${businessConfig.businessName}.
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

Receptionist rules:
- Never mention AI.
- Sound calm, natural, and human.
- Keep replies short, but not robotic.
- Ask only one question at a time.
- If you do not understand, say: "Sorry, I didn't quite understand. Could you say that again?"
- If the caller asks about booking availability, guide them toward booking.
- If the caller asks to repeat booking details, repeat the current booking details if known.
- If the caller says something is wrong, ask exactly which detail needs changing.
- If the caller does not need anything else, end politely.
- If you do not know something, say: "${businessConfig.fallback}"
- Do not make up policies, prices, or availability.
`
      },
      ...state.conversationHistory.slice(-8),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}
