// Build-time indexing: embed each corpus chunk once and write src/index.json.
// Doing this at build time (not per request) means the Worker needs no vector
// database, and each question costs one small embedding call plus one chat call.
//
//   OpenAI:     OPENAI_API_KEY=sk-...      npm run build:index
//   OpenRouter: OPENROUTER_API_KEY=sk-or-... npm run build:index
//
// IMPORTANT: the embedding model used here must match EMBED_MODEL at query time.
// Vectors from different embedding models are not comparable — if you change the
// model, re-run this script and redeploy.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const openRouterKey = process.env.OPENROUTER_API_KEY;
const apiKey = openRouterKey || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(
    "No API key found. Export one and re-run:\n" +
      "  OPENAI_API_KEY=sk-... npm run build:index\n" +
      "  OPENROUTER_API_KEY=sk-or-... npm run build:index",
  );
  process.exit(1);
}

const baseUrl = (
  process.env.BASE_URL || (openRouterKey ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1")
).replace(/\/$/, "");
const embedModel = process.env.EMBED_MODEL || "text-embedding-3-small";

const corpus = JSON.parse(readFileSync(join(ROOT, "corpus/corpus.json"), "utf8"));
console.log(`Embedding ${corpus.length} chunks with ${embedModel} via ${baseUrl}...`);

const res = await fetch(`${baseUrl}/embeddings`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(openRouterKey ? { "X-Title": "Ask my resume (index build)" } : {}),
  },
  body: JSON.stringify({ model: embedModel, input: corpus.map((c) => `${c.title}\n${c.text}`) }),
});

if (!res.ok) {
  console.error(`Embedding request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
if (!Array.isArray(data.data) || data.data.length !== corpus.length) {
  console.error(`Expected ${corpus.length} embeddings, got ${data.data?.length}. Aborting.`);
  process.exit(1);
}

const chunks = corpus.map((c, i) => ({ ...c, embedding: data.data[i].embedding }));

writeFileSync(
  join(ROOT, "src/index.json"),
  JSON.stringify({ embedModel, builtAt: new Date().toISOString(), chunks }),
);

console.log(`Wrote src/index.json (${chunks.length} chunks, ${chunks[0].embedding.length} dims).`);
console.log(`Make sure EMBED_MODEL in wrangler.toml is "${embedModel}", then: npm run deploy`);
