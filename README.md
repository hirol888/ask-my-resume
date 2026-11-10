# Ask my resume

A grounded RAG assistant that answers recruiters' questions about my background, with citations —
running on Cloudflare Workers with OpenAI embeddings and `gpt-4o-mini`.

The point isn't the chatbot. It's that the engineering is visible: strict grounding, earned
citations, guardrails in both directions, transient-only retries, and hard cost caps.

```
Question → input guard → embed → cosine top-k → grounded prompt → gpt-4o-mini
         → output guard → cite only what was used → answer
```

## Deploy it (about 15 minutes)

**1. Review the corpus first.** `corpus/corpus.json` is the *only* thing the assistant can say.
Read every chunk and correct anything inaccurate. Nothing confidential about an employer's internal
systems, and no phone number or home address.

```bash
npm install
```

**2. Build the vector index** (one embedding call, a fraction of a cent). Re-run whenever the corpus changes:

```bash
# OpenAI direct
OPENAI_API_KEY=sk-... npm run build:index          # writes src/index.json

# or via OpenRouter
OPENROUTER_API_KEY=sk-or-... npm run build:index
```

> **Keep the embedding models in sync.** Whatever model builds the index must be the same
> `EMBED_MODEL` the worker queries with — vectors from different embedding models aren't comparable,
> and mismatching them silently produces nonsense rankings rather than an error. Change the model →
> rebuild the index → redeploy.

**3. Test and typecheck:**

```bash
npm test          # 15 tests, no API key needed (lexical fallback + fake model)
npm run typecheck
```

**4. Log in to Cloudflare and set the secret** (whichever provider you're using):

```bash
npx wrangler login
npx wrangler secret put OPENAI_API_KEY        # OpenAI direct
# or
npx wrangler secret put OPENROUTER_API_KEY    # OpenRouter
```

If `OPENROUTER_API_KEY` is set, `BASE_URL` defaults to `https://openrouter.ai/api/v1` and you should
use namespaced model ids in `wrangler.toml` — e.g. `MODEL = "openai/gpt-4o-mini"` or
`"anthropic/claude-3.5-haiku"`.

**5. (Recommended) durable rate limiting** — create a KV namespace, then paste the id into
`wrangler.toml` and uncomment the `kv_namespaces` block:

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Without KV it still works, but limits are per-isolate best-effort only.

**6. Run locally, then ship:**

```bash
npm run dev       # http://localhost:8787
npm run deploy    # → https://ask-my-resume.<your-subdomain>.workers.dev
```

**7. Set an OpenAI spend limit** in the OpenAI dashboard (Billing → Limits). Belt and braces
alongside the daily cap. A custom domain can be attached in the Cloudflare dashboard
(Workers → your worker → Settings → Domains) if you'd prefer `ask.yourdomain.com`.

## Putting it on your resume

Keep it as a supplement — the PDF must still stand alone, because plenty of recruiters won't click
and ATS parsers only see a URL. A single line under your contact details works:

> **Ask my resume:** `ask.yourdomain.com` — a RAG assistant I built that answers questions about my
> experience, grounded in my own documents with source citations.

## Configuration

Set in `wrangler.toml` under `[vars]`:

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | OpenAI (or OpenRouter if its key is set) | Any OpenAI-compatible endpoint |
| `MODEL` | `gpt-4o-mini` | Chat model (namespaced id on OpenRouter) |
| `EMBED_MODEL` | `text-embedding-3-small` | Must match the index build |
| `SITE_URL` | unset | Sent as `HTTP-Referer` (OpenRouter attribution) |
| `MAX_QUESTION_CHARS` | `500` | Rejects over-long prompts |
| `MAX_OUTPUT_TOKENS` | `450` | Caps cost per answer |
| `RATE_LIMIT_PER_MINUTE` | `6` | Per-IP limit |
| `DAILY_QUESTION_CAP` | `500` | Global daily ceiling |

Secret: `OPENAI_API_KEY` **or** `OPENROUTER_API_KEY` (via `wrangler secret put` — never committed).
The client is a single OpenAI-compatible adapter, so Azure OpenAI or a self-hosted endpoint works too
by setting `BASE_URL`.

## Cost

Each question is one small embedding call plus one `gpt-4o-mini` call over ~1–2k tokens of context —
well under a cent. With the default caps the worst case is a couple of dollars a month, and
Cloudflare's free tier covers the hosting.

## Design notes

- **Build-time indexing.** Embeddings are computed once and shipped as `src/index.json`. The corpus is
  small (21 chunks), so in-memory cosine similarity is plenty — no vector database to run, pay for, or
  keep alive. Honest trade-off: this wouldn't scale to a large corpus, and that's fine, it doesn't need to.
- **Grounding over fluency.** A confident wrong claim about my own experience would be worse than no
  answer, so the model may only use retrieved context, and the pipeline refuses outright when retrieval
  returns nothing above threshold — the model is never even called.
- **Citations are earned.** Only ids the answer actually references are returned, not everything
  retrieval surfaced. Retrieval is not grounding.
- **Guardrails both ways, with reasons.** Injection/credential probes are screened before the model
  call; answers are screened for prompt or key leakage before display. Both return reasons rather than
  a bare boolean, so decisions are auditable.
- **Reliability.** Only transient errors (429/5xx) are retried; 4xx fails fast. Calls time out at 20s.
  Failures degrade to a helpful "email me" message, never a fabricated answer.
- **Testability.** Retrieval, guardrails and prompt-building are pure functions; the model sits behind a
  `ModelClient` interface with a deterministic fake, and a lexical retriever lets the whole pipeline run
  offline with no key.

## Layout

```
corpus/corpus.json     the source of truth — edit this, then rebuild the index
scripts/build-index.mjs embeds the corpus → src/index.json
src/retrieval.ts       cosine + lexical fallback, top-k with a relevance floor
src/guardrails.ts      input and output screening, with reasons
src/prompt.ts          system prompt, context assembly, citation extraction
src/openai.ts          model client + transient-only retry
src/pipeline.ts        guard → retrieve → generate → verify → cite
src/limits.ts          per-IP rate limit + global daily cap (KV or in-memory)
src/page.ts            the single-page UI, including a "how it's built" panel
src/worker.ts          routing and wiring
test/                  vitest suites (run with no API key)
```
