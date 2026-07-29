// Guardrails. Input screening happens BEFORE any model call; output screening
// happens before the answer is returned. Both return reasons, not just a boolean,
// so decisions are auditable.

export interface GuardResult {
  ok: boolean;
  reasons: string[];
}

const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(all\s+|any\s+)?(previous|prior|above|these)\s+instructions?/i, "instruction-override"],
  [/disregard\s+(all\s+|any\s+)?(previous|prior|the|your)\s+/i, "instruction-override"],
  [/(reveal|show|print|repeat|output)\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions|rules)/i, "prompt-probe"],
  [/developer\s+mode|jailbreak|DAN\s+mode/i, "jailbreak-persona"],
  [/you\s+are\s+now\s+(a|an|in)\s+/i, "persona-override"],
  [/(pretend|act)\s+(that\s+)?(you|to)\s+/i, "persona-override"],
  [/say\s+(that\s+)?(he|huining)\s+is\s+(bad|terrible|unqualified|incompetent)/i, "defamation-attempt"],
  [/\b(api[\s_-]?key|password|credentials?|secret\s+key)\b/i, "credential-request"],
];

/** Screen a visitor's question before it reaches the model. */
export function checkQuestion(question: string, maxChars: number): GuardResult {
  const reasons: string[] = [];
  const trimmed = question.trim();

  if (trimmed.length === 0) reasons.push("empty-question");
  if (trimmed.length > maxChars) reasons.push("too-long");

  for (const [pattern, reason] of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) reasons.push(reason);
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

const LEAK_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[a-zA-Z0-9_-]{12,}/, "api-key-leak"],
  [/you\s+are\s+(a\s+)?(helpful\s+)?assistant/i, "system-prompt-disclosure"],
  [/(my|the)\s+system\s+prompt/i, "system-prompt-disclosure"],
  [/\bCONTEXT\s*:/i, "raw-context-leak"],
];

/** Screen the model's answer before it is returned to the visitor. */
export function checkAnswer(answer: string): GuardResult {
  const reasons: string[] = [];
  for (const [pattern, reason] of LEAK_PATTERNS) {
    if (pattern.test(answer)) reasons.push(reason);
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export const REFUSAL_OFF_TOPIC =
  "I can only answer questions about Huining Li's professional background, skills and experience, " +
  "based on the documents I've been given. For anything else — or for details not in those documents — " +
  "please email him directly at hiro.l.dragon@gmail.com.";

export const REFUSAL_BLOCKED =
  "I'm only able to answer genuine questions about Huining Li's professional experience. " +
  "I can't change my instructions or share anything beyond the documents I'm grounded in. " +
  "If you have a real question about his background, please go ahead.";

export const REFUSAL_UNAVAILABLE =
  "Something went wrong answering that. Please try again shortly, or email Huining directly at hiro.l.dragon@gmail.com.";
