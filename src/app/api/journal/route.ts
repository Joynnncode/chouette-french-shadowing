import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a friendly, encouraging French teacher reviewing a learner's short diary or essay entry.

First, write a short (2-4 sentence) piece of encouraging overall feedback in English about their writing — content, style, effort.

Then, for every grammar, vocabulary, spelling, or word-order mistake in the entry, list it on its own line, in this exact machine-readable format, placed at the very end of your reply after your feedback:

CORRECTION | wrong="<exactly what they wrote>" | right="<corrected version>" | note="<short English explanation>"

If there are no mistakes, do not include any CORRECTION line.`;

export async function POST(req: Request) {
  const { content }: { content: string } = await req.json();

  const provider = req.headers.get("x-ai-provider");
  const apiKey = req.headers.get("x-ai-key");
  const model = req.headers.get("x-ai-model");

  if (!provider || !apiKey || !model) {
    return Response.json({ error: "Missing AI provider settings" }, { status: 400 });
  }
  if (!content?.trim()) {
    return Response.json({ error: "Journal entry is empty" }, { status: 400 });
  }

  const languageModel =
    provider === "openai"
      ? createOpenAI({ apiKey })(model)
      : createAnthropic({ apiKey })(model);

  try {
    const { text } = await generateText({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt: content,
    });

    const regex = /^CORRECTION\s*\|\s*wrong="([^"]*)"\s*\|\s*right="([^"]*)"\s*\|\s*note="([^"]*)"/;
    const corrections: { wrong: string; right: string; note: string }[] = [];
    const feedbackLines: string[] = [];

    for (const line of text.split("\n")) {
      const match = line.match(regex);
      if (match) {
        corrections.push({ wrong: match[1], right: match[2], note: match[3] });
      } else {
        feedbackLines.push(line);
      }
    }

    return Response.json({ feedback: feedbackLines.join("\n").trim(), corrections });
  } catch (error) {
    console.error("Journal feedback error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong talking to the AI.";
    return Response.json({ error: message }, { status: 502 });
  }
}
