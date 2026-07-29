// Retrieval: cosine similarity over pre-computed embeddings, with a deterministic
// lexical fallback so the system still works (and stays testable) with no API key.

export interface Chunk {
  id: string;
  title: string;
  text: string;
  embedding?: number[];
}

export interface Scored {
  chunk: Chunk;
  score: number;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "is", "are", "was",
  "were", "be", "with", "as", "at", "by", "from", "that", "this", "it", "he", "his",
  "him", "you", "your", "what", "which", "who", "how", "does", "do", "did", "has",
  "have", "had", "can", "any", "about", "tell", "me", "please",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Deterministic keyword scoring — used when no embedding is available. */
export function lexicalScore(query: string, chunk: Chunk): number {
  const q = new Set(tokenize(query));
  if (q.size === 0) return 0;
  const hay = new Set(tokenize(`${chunk.title} ${chunk.text}`));
  let hits = 0;
  for (const t of q) if (hay.has(t)) hits++;
  return hits / q.size;
}

/**
 * Rank chunks against a query. Uses vectors when a query embedding is supplied
 * and the chunks are indexed; otherwise falls back to lexical overlap.
 * Returns only chunks that clear `minScore`, so an off-topic question retrieves
 * nothing and the caller can refuse instead of inventing an answer.
 */
export function retrieve(
  query: string,
  chunks: Chunk[],
  opts: { queryEmbedding?: number[]; k?: number; minScore?: number } = {},
): Scored[] {
  const k = opts.k ?? 4;
  const useVectors = !!opts.queryEmbedding && chunks.some((c) => c.embedding?.length);
  const minScore = opts.minScore ?? (useVectors ? 0.2 : 0.12);

  const scored: Scored[] = chunks.map((chunk) => ({
    chunk,
    score:
      useVectors && chunk.embedding?.length
        ? cosine(opts.queryEmbedding!, chunk.embedding)
        : lexicalScore(query, chunk),
  }));

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
