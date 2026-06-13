/** Normalize titles for fuzzy provider ↔ AniList matching (punctuation-insensitive). */
export function normalizeProviderMatchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const SPINOFF_PATTERN =
  /\b(specials?|spesial|ova|ovas|movie|films?|picture drama|manner movie|bonus|extra|recap|preview)\b/i;

/** Penalize spin-offs when the search query targets the main TV series. */
export function providerMatchSpinoffPenalty(candidateTitle: string, query: string): number {
  const candidate = candidateTitle.toLowerCase();
  const needle = query.toLowerCase();
  if (!SPINOFF_PATTERN.test(candidate) && !/\bzero\b/i.test(candidate)) return 0;

  if (/\bzero\b/i.test(needle) && /\bzero\b/i.test(candidate)) return 0;
  if (/\bzero\b/i.test(needle) && /\bmanner\b/i.test(candidate)) return 55;
  if (/\bspecial/i.test(needle) && /\bspecial/i.test(candidate)) return 0;
  if (/\b(movie|film|ova)\b/i.test(needle) && /\b(movie|film|ova)\b/i.test(candidate)) return 0;

  return 45;
}

export function scoreProviderTitleMatch(candidateTitle: string, query: string): number {
  const candidate = normalizeProviderMatchKey(candidateTitle);
  const needle = normalizeProviderMatchKey(query);
  if (!candidate || !needle) return 0;

  let score = 0;
  if (candidate === needle) score = 100;
  else if (candidate.startsWith(needle) || needle.startsWith(candidate)) score = 85;
  else if (candidate.includes(needle) || needle.includes(candidate)) score = 70;

  if (!score) return 0;
  return Math.max(0, score - providerMatchSpinoffPenalty(candidateTitle, query));
}
