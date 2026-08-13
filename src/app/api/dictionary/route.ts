import { normalizeFrenchWord } from "@/lib/dictionary";
import { lookupFrenchWord } from "@/lib/wiktionary";

export const maxDuration = 15;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("word")?.trim() ?? "";
  const word = normalizeFrenchWord(raw);

  if (!word || word.length > 60 || !/^[\p{L}\p{M}'\-]+$/u.test(word)) {
    return Response.json({ error: "Invalid word" }, { status: 400 });
  }

  try {
    const result = await lookupFrenchWord(word);
    if (!result) {
      return Response.json({ error: "No dictionary entry found" }, { status: 404 });
    }
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("Dictionary lookup failed:", error);
    return Response.json({ error: "Dictionary lookup failed" }, { status: 502 });
  }
}
