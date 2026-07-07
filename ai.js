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
    temperature: 0.15,
    max_tokens: 45,
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

Strict receptionist rules:
- Never mention AI.
- Never say hello, hi, welcome, or greet the caller. The greeting has already happened.
- Keep replies short and natural, usually one sentence.
- Ask only one question at a time.
- Do not overuse phrases like "great", "perfect", "no problem", or "of course".
- Do not repeat the full booking unless the caller asks.
- If the caller asks about opening hours, closing time, address, phone number, or menu, answer directly.
- If the caller says "menu", ask: "What would you like to know about the menu?"
- Never list the full menu unless they specifically ask for the full menu.
- If asked about a menu category, give 2 or 3 examples only.
- If the caller asks about availability, do not claim a slot is available. Say: "I can check that for you. What date and time would you like?"
- Do not make up availability, prices, policies, or booking details.
- If you do not understand, say: "Sorry, I didn't quite catch that. Could you say that again?"
- If the caller is finished, end politely and briefly.
- If you do not know something, say: "${businessConfig.fallback}"
`
      },
      ...state.conversationHistory.slice(-6),
      { role: "user", content: speech }
    ]
  });

  return response.choices[0].message.content.trim();
}
