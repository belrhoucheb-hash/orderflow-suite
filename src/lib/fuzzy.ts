// Lichte fuzzy-matching zonder externe library.
//
// Gebruikt twee mechanismen:
//   1. Substring-match (case-insensitive), score 0 als de query een
//      aaneengesloten substring is van het veld.
//   2. Subsequence-match: alle tekens van de query verschijnen in volgorde
//      in het veld (niet noodzakelijk aaneengesloten). Score loopt op met
//      de gaten tussen matches.
// Hogere score = slechter. Resultaten worden gesorteerd op score asc.
//
// Bedoeld voor connector-marketplace zoekbar; werkt op kleine lijsten
// (tientallen items), dus geen Bitap of Levenshtein nodig.

export interface FuzzyMatch<T> {
  item: T;
  score: number;
  /** Indices van de matched-letters in de getoonde string, voor highlight. */
  matchedIndices: number[];
  /** Welk veld de match opleverde. */
  matchedField: string;
}

export interface FuzzyField<T> {
  name: string;
  weight?: number;
  get: (item: T) => string | undefined | null;
}

export interface FuzzyOptions<T> {
  fields: Array<FuzzyField<T>>;
  /** Maximaal aantal hits dat teruggegeven wordt. */
  limit?: number;
  /** Score-grens; matches met score > threshold vallen af. */
  threshold?: number;
}

interface InternalMatch {
  score: number;
  indices: number[];
}

function substringMatch(query: string, target: string): InternalMatch | null {
  const idx = target.indexOf(query);
  if (idx === -1) return null;
  const indices: number[] = [];
  for (let i = 0; i < query.length; i++) indices.push(idx + i);
  // Score: 0 voor exact-prefix, ~ voor later in de string.
  return { score: idx === 0 ? 0 : idx * 0.05, indices };
}

function subsequenceMatch(query: string, target: string): InternalMatch | null {
  const indices: number[] = [];
  let qi = 0;
  let lastIdx = -1;
  let totalGap = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) {
      indices.push(i);
      if (lastIdx !== -1) totalGap += i - lastIdx - 1;
      lastIdx = i;
      qi++;
    }
  }
  if (qi < query.length) return null;
  // Penalty op basis van gaten + start-offset.
  const startOffset = indices[0] ?? 0;
  return {
    score: 1 + totalGap * 0.05 + startOffset * 0.01,
    indices,
  };
}

function matchField(query: string, value: string): InternalMatch | null {
  const target = value.toLowerCase();
  const sub = substringMatch(query, target);
  if (sub) return sub;
  return subsequenceMatch(query, target);
}

export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  options: FuzzyOptions<T>,
): Array<FuzzyMatch<T>> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const threshold = options.threshold ?? 4;
  const results: Array<FuzzyMatch<T>> = [];

  for (const item of items) {
    let best: { score: number; indices: number[]; field: string } | null = null;
    for (const field of options.fields) {
      const raw = field.get(item);
      if (!raw) continue;
      const m = matchField(trimmed, raw);
      if (!m) continue;
      const weight = field.weight ?? 1;
      const score = m.score / weight;
      if (!best || score < best.score) {
        best = { score, indices: m.indices, field: field.name };
      }
    }
    if (best && best.score <= threshold) {
      results.push({
        item,
        score: best.score,
        matchedIndices: best.indices,
        matchedField: best.field,
      });
    }
  }

  results.sort((a, b) => a.score - b.score);
  return options.limit ? results.slice(0, options.limit) : results;
}

/**
 * Splits een string in segmenten, per teken markerend of het in
 * `matchedIndices` zit. Handig om matched-substrings te highlighten
 * in JSX zonder dangerouslySetInnerHTML.
 */
export function highlightSegments(
  text: string,
  matchedIndices: number[],
): Array<{ text: string; match: boolean }> {
  if (matchedIndices.length === 0) return [{ text, match: false }];
  const set = new Set(matchedIndices);
  const segments: Array<{ text: string; match: boolean }> = [];
  let buffer = "";
  let bufferMatch = false;
  for (let i = 0; i < text.length; i++) {
    const isMatch = set.has(i);
    if (i === 0) {
      buffer = text[i];
      bufferMatch = isMatch;
      continue;
    }
    if (isMatch === bufferMatch) {
      buffer += text[i];
    } else {
      segments.push({ text: buffer, match: bufferMatch });
      buffer = text[i];
      bufferMatch = isMatch;
    }
  }
  if (buffer) segments.push({ text: buffer, match: bufferMatch });
  return segments;
}
