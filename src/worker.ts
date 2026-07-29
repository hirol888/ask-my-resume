import { PAGE } from "./page";
import { ask } from "./pipeline";
import { OpenAiCompatibleClient } from "./openai";
import { REFUSAL_UNAVAILABLE } from "./guardrails";
import { isOverDailyCap, isRateLimited } from "./limits";
import type { Chunk } from "./retrieval";
import index from "./index.json";

interface Env {
  /** Set whichever matches your provider; OpenRouter takes precedence if both exist. */
  OPENROUTER_API_KEY?: string;
  OPENAI_API_KEY?: string;
  BASE_URL?: string;
  MODEL?: string;
  EMBED_MODEL?: string;
  SITE_URL?: string;
  MAX_QUESTION_CHARS?: string;
  MAX_OUTPUT_TOKENS?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  DAILY_QUESTION_CAP?: string;
  RATE_LIMIT?: KVNamespace;
}

const CHUNKS = (index as { chunks: Chunk[] }).chunks;
const num = (v: string | undefined, fallback: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(PAGE, {
        headers: { "content-type": "text/html;charset=utf-8", "cache-control": "public, max-age=300" },
      });
    }

    if (url.pathname === "/api/ask") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

      if (await isRateLimited(env, ip, num(env.RATE_LIMIT_PER_MINUTE, 6))) {
        return json({ answer: "That's a lot of questions at once — please wait a moment and try again.", citations: [] }, 429);
      }
      if (await isOverDailyCap(env, num(env.DAILY_QUESTION_CAP, 500))) {
        return json({ answer: "This assistant has hit its daily limit. Please email hiro.l.dragon@gmail.com.", citations: [] }, 429);
      }

      let question = "";
      try {
        question = String(((await request.json()) as { question?: unknown }).question ?? "");
      } catch {
        return json({ error: "invalid json" }, 400);
      }

      try {
        const usingOpenRouter = !!env.OPENROUTER_API_KEY;
        const model = new OpenAiCompatibleClient({
          apiKey: (env.OPENROUTER_API_KEY || env.OPENAI_API_KEY) ?? "",
          baseUrl: env.BASE_URL ?? (usingOpenRouter ? "https://openrouter.ai/api/v1" : undefined),
          chatModel: env.MODEL,
          embedModel: env.EMBED_MODEL,
          referer: env.SITE_URL,
          title: "Ask my resume",
        });
        const result = await ask(question, CHUNKS, model, {
          maxQuestionChars: num(env.MAX_QUESTION_CHARS, 500),
          maxOutputTokens: num(env.MAX_OUTPUT_TOKENS, 450),
        });
        return json({ answer: result.answer, citations: result.citations, refused: result.refused });
      } catch (error) {
        // Log the reason for us; return something safe and useful to the visitor.
        console.error("ask failed:", error);
        return json({ answer: REFUSAL_UNAVAILABLE, citations: [] }, 200);
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
