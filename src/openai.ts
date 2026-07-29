// Model client for any OpenAI-compatible endpoint: OpenAI directly, OpenRouter,
// Azure OpenAI, or a local server. Only the base URL, key and model ids change.
// Kept behind a small interface so the provider can be swapped (or faked in tests)
// without touching pipeline logic.

export class TransientApiError extends Error {
  readonly retryable = true;
}
export class PermanentApiError extends Error {
  readonly retryable = false;
}

export interface ModelClient {
  embed(text: string): Promise<number[]>;
  chat(system: string, user: string, maxTokens: number): Promise<string>;
}

export interface ClientConfig {
  apiKey: string;
  /** e.g. https://api.openai.com/v1 or https://openrouter.ai/api/v1 */
  baseUrl?: string;
  chatModel?: string;
  embedModel?: string;
  /** OpenRouter uses these for attribution; harmless elsewhere. */
  referer?: string;
  title?: string;
}

const DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  chatModel: "gpt-4o-mini",
  embedModel: "text-embedding-3-small",
};

const TIMEOUT_MS = 20_000;

export class OpenAiCompatibleClient implements ModelClient {
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embedModel: string;

  constructor(private readonly cfg: ClientConfig) {
    this.baseUrl = (cfg.baseUrl || DEFAULTS.baseUrl).replace(/\/$/, "");
    this.chatModel = cfg.chatModel || DEFAULTS.chatModel;
    this.embedModel = cfg.embedModel || DEFAULTS.embedModel;
  }

  private async call(path: string, body: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.cfg.apiKey}`,
          ...(this.cfg.referer ? { "HTTP-Referer": this.cfg.referer } : {}),
          ...(this.cfg.title ? { "X-Title": this.cfg.title } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        throw new TransientApiError(`upstream ${res.status}`);
      }
      if (!res.ok) {
        throw new PermanentApiError(`upstream ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text: string): Promise<number[]> {
    const data = await this.call("/embeddings", { model: this.embedModel, input: text });
    return data.data[0].embedding as number[];
  }

  async chat(system: string, user: string, maxTokens: number): Promise<string> {
    const data = await this.call("/chat/completions", {
      model: this.chatModel,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return (data.choices?.[0]?.message?.content ?? "").trim();
  }
}

/** Backwards-compatible alias. */
export const OpenAiClient = OpenAiCompatibleClient;

/** Retry transient failures only. Retrying a 4xx just burns latency and money. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 250): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!(error as { retryable?: boolean })?.retryable) throw error;
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
