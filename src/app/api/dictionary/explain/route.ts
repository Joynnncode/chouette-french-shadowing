import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogle } from "@ai-sdk/google";

export const maxDuration = 30;

const SYSTEM_PROMPT = `你是一位帮助中文母语者学习法语的老师。学习者在跟读法语材料时点击了句子中的一个词，你要用中文解释这个词。

严格按下面的格式回答，不要写任何多余的话，不要用 markdown 标记：

原形：<这个词的词典原形（动词写不定式，名词写单数，形容词写阳性单数），如果本身就是原形就写它自己> · <词性，用中文写，如 动词／名词（阳）／形容词>
释义：<最常用的 1-3 个中文意思，用「；」分隔>
本句：<这个词在给出的句子里具体是什么意思、是什么变化形式，一句话讲清楚，例如「terminer 的简单将来时第三人称单数，意为『将结束』」>

如果这个词是专有名词、数字或不是法语词，就在「本句」里直接说明。`;

export async function POST(req: Request) {
  const { word, context }: { word?: string; context?: string } = await req.json();

  const provider = req.headers.get("x-ai-provider");
  const apiKey = req.headers.get("x-ai-key");
  const model = req.headers.get("x-ai-model");

  if (!provider || !apiKey || !model) {
    return Response.json({ error: "Missing AI provider settings" }, { status: 400 });
  }
  if (!word?.trim()) {
    return Response.json({ error: "No word given" }, { status: 400 });
  }

  const languageModel =
    provider === "openai"
      ? createOpenAI({ apiKey })(model)
      : provider === "gemini"
        ? createGoogle({ apiKey })(model)
        : createAnthropic({ apiKey })(model);

  try {
    const { text } = await generateText({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt: `单词：${word.trim()}\n所在句子：${context?.trim() || "（没有提供上下文）"}`,
    });
    return Response.json({ text: text.trim() });
  } catch (error) {
    console.error("Dictionary explain failed:", error);
    return Response.json({ error: "Couldn't reach the AI provider" }, { status: 502 });
  }
}
