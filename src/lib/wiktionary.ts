import {
  normalizeFrenchWord,
  type DictionaryResult,
  type DictionarySense,
} from "@/lib/dictionary";

type WiktionaryDefinition = { definition: string };
type WiktionaryEntry = {
  partOfSpeech: string;
  language: string;
  definitions: WiktionaryDefinition[];
};

const API = "https://en.wiktionary.org/api/rest_v1/page/definition";
const USER_AGENT = "Chouette-FrenchShadowing/1.0 (French learning app)";
const ONE_MONTH = 60 * 60 * 24 * 30;

function stripHtml(html: string): string {
  return html
    // Entries inline a <style> block whose CSS would otherwise survive tag removal.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    // Inflection entries append a nested <ol> spelling out every matching form; drop it.
    .replace(/<ol\b[^>]*>[\s\S]*$/i, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[:\s]+$/, "")
    .trim();
}

/** Inflection entries link to their base form inside a `form-of-definition-link` span. */
function extractLemma(html: string): string | null {
  const span = html.match(/class="form-of-definition-link"[\s\S]*?<\/span>/);
  if (!span) return null;
  const href = span[0].match(/href="(?:\/wiki\/|\.\/)([^"#]+)#French"/);
  if (!href) return null;
  try {
    return decodeURIComponent(href[1]).replace(/_/g, " ");
  } catch {
    return href[1].replace(/_/g, " ");
  }
}

async function fetchFrenchEntries(word: string): Promise<WiktionaryEntry[] | null> {
  const res = await fetch(`${API}/${encodeURIComponent(word)}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    next: { revalidate: ONE_MONTH },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as Record<string, WiktionaryEntry[]>;
  const entries = json.fr ?? json.other?.filter((e) => e.language === "French") ?? null;
  return entries?.length ? entries : null;
}

function toSenses(entries: WiktionaryEntry[]): DictionarySense[] {
  return entries
    .map((entry) => ({
      partOfSpeech: entry.partOfSpeech,
      definitions: entry.definitions
        .map((d) => stripHtml(d.definition))
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter((sense) => sense.definitions.length > 0);
}

function findLemma(entries: WiktionaryEntry[], current: string): string | null {
  return (
    entries
      .flatMap((entry) => entry.definitions.map((d) => extractLemma(d.definition)))
      .find((candidate): candidate is string => !!candidate && candidate !== current) ?? null
  );
}

/**
 * Looks a French word up on Wiktionary. Conjugated and plural forms resolve to
 * their base form, so tapping "terminera" also returns the senses of "terminer".
 * Inflections can chain — "découragée" is the feminine of "découragé", which is
 * itself the past participle of "décourager" — so follow a few hops.
 */
export async function lookupFrenchWord(raw: string): Promise<DictionaryResult | null> {
  const query = normalizeFrenchWord(raw);
  if (!query) return null;

  let entries = await fetchFrenchEntries(query);
  // Wiktionary titles are case-sensitive; sentence-initial words are capitalized.
  if (!entries && query !== query.toLowerCase()) {
    entries = await fetchFrenchEntries(query.toLowerCase());
  }
  if (!entries) return null;

  let headword = query;
  let senses = toSenses(entries);
  const notes: string[] = [];

  for (let hop = 0; hop < 3; hop++) {
    const lemma = findLemma(entries, headword);
    if (!lemma) break;
    const lemmaEntries = await fetchFrenchEntries(lemma);
    if (!lemmaEntries) break;

    notes.push(senses[0]?.definitions[0] ?? `form of ${lemma}`);
    headword = lemma;
    entries = lemmaEntries;
    senses = toSenses(lemmaEntries);
  }

  return {
    query,
    lemma: headword === query ? null : headword,
    inflectionNote: notes.join(" · ") || null,
    senses,
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(headword)}#French`,
  };
}
