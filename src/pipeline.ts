// The answer pipeline: guard -> retrieve -> generate -> verify -> cite.
// Pure of any Worker/HTTP concerns so it can be tested directly.

import { checkAnswer, checkQuestion, REFUSAL_BLOCKED, REFUSAL_OFF_TOPIC } from "./guardrails";
import { buildUserMessage, extractCitations, SYSTEM_PROMPT } from "./prompt";
import { retrieve, type Chunk } from "./retrieval";
import { withRetry, type ModelClient } from "./openai";

export interface AskResult {
  answer: string;
  citations: string[];
  refused: boolean;
  reasons: string[];
  retrievedIds: string[];
}

export interface AskOptions {
  maxQuestionChars?: number;
  maxOutputTokens?: number;
  /** Skip embeddings and use lexical retrieval (used offline / in tests). */
  lexicalOnly?: boolean;
}

export async function ask(
  question: string,
  chunks: Chunk[],
  model: ModelClient,
  opts: AskOptions = {},
): Promise<AskResult> {
  const maxQuestionChars = opts.maxQuestionChars ?? 500;
  const maxOutputTokens = opts.maxOutputTokens ?? 450;

  // 1. Guard the input BEFORE any model call.
  const guard = checkQuestion(question, maxQuestionChars);
  if (!guard.ok) {
    return { answer: REFUSAL_BLOCKED, citations: [], refused: true, reasons: guard.reasons, retrievedIds: [] };
  }

  // 2. Retrieve. No embedding call is made if we're in lexical mode.
  const queryEmbedding = opts.lexicalOnly ? undefined : await withRetry(() => model.embed(question));
  const hits = retrieve(question, chunks, { queryEmbedding, k: 4 });

  // 3. Nothing relevant retrieved -> refuse rather than let the model improvise.
  if (hits.length === 0) {
    return {
      answer: REFUSAL_OFF_TOPIC,
      citations: [],
      refused: true,
      reasons: ["no-relevant-context"],
      retrievedIds: [],
    };
  }

  // 4. Generate, grounded strictly in the retrieved context.
  const answer = await withRetry(() =>
    model.chat(SYSTEM_PROMPT, buildUserMessage(question, hits), maxOutputTokens),
  );

  // 5. Verify the output before it reaches the visitor.
  const outbound = checkAnswer(answer);
  if (!outbound.ok) {
    return {
      answer: REFUSAL_OFF_TOPIC,
      citations: [],
      refused: true,
      reasons: outbound.reasons,
      retrievedIds: hits.map((h) => h.chunk.id),
    };
  }

  // 6. Cite only what the answer actually used — retrieval is not grounding.
  return {
    answer,
    citations: extractCitations(answer, hits),
    refused: false,
    reasons: [],
    retrievedIds: hits.map((h) => h.chunk.id),
  };
}
