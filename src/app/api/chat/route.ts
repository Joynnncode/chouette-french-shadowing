import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a friendly, encouraging French conversation tutor.
Reply mostly in French, at a level that matches what the learner writes, but explain any corrections in English.

Whenever the learner's French contains a grammar, vocabulary, spelling, or word-order mistake, list each mistake on its own line, in this exact machine-readable format, placed at the very end of your reply after your normal conversational response:

CORRECTION | wrong="<exactly what they wrote>" | right="<corrected version>" | note="<short English explanation>"

If there are no mistakes, do not include any CORRECTION line. Keep the conversational part warm and natural; keep corrections concise.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const provider = req.headers.get("x-ai-provider");
  const apiKey = req.headers.get("x-ai-key");
  const model = req.headers.get("x-ai-model");

  if (!provider || !apiKey || !model) {
    return new Response("Missing AI provider settings", { status: 400 });
  }

  const languageModel =
    provider === "openai"
      ? createOpenAI({ apiKey })(model)
      : createAnthropic({ apiKey })(model);

  const result = streamText({
    model: languageModel,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
