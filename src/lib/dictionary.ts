export type DictionarySense = {
  partOfSpeech: string;
  definitions: string[];
};

export type DictionaryResult = {
  /** The form we actually looked up, after stripping punctuation and elisions. */
  query: string;
  /** Base form, when the queried word turned out to be an inflection. */
  lemma: string | null;
  /** How the queried word relates to the lemma, e.g. "past participle of commencer". */
  inflectionNote: string | null;
  senses: DictionarySense[];
  sourceUrl: string;
};

/** One line per part of speech: "Verb: to end; to finish". */
export function formatSenses(senses: DictionarySense[]): string[] {
  return senses.map((sense) => `${sense.partOfSpeech}: ${sense.definitions.join("; ")}`);
}

/** Elided prefixes that get glued to the next word: l'homme, qu'il, jusqu'à… */
const ELISIONS = [
  "jusqu",
  "lorsqu",
  "puisqu",
  "quoiqu",
  "qu",
  "c",
  "d",
  "j",
  "l",
  "m",
  "n",
  "s",
  "t",
];

/** Turns a word as it appears in a transcript into something Wiktionary can look up. */
export function normalizeFrenchWord(raw: string): string {
  let word = raw
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    // Trim anything that isn't a letter, apostrophe or hyphen from both ends.
    .replace(/^[^\p{L}]+/u, "")
    .replace(/[^\p{L}]+$/u, "")
    .trim();

  const apostrophe = word.indexOf("'");
  if (apostrophe > 0) {
    const prefix = word.slice(0, apostrophe).toLowerCase();
    const rest = word.slice(apostrophe + 1);
    if (rest && ELISIONS.includes(prefix)) word = rest;
  }

  return word;
}
