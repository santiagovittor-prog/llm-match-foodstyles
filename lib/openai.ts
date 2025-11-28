// lib/openai.ts
import OpenAI from "openai";
import type { DatasetRow } from "./types";
import type { MatchResultUpdate } from "./sheets";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "Warning: OPENAI_API_KEY is not set. OpenAI calls will fail until you configure it."
  );
}

export type LlmMatchOutput = {
  verdict: "SAME" | "DIFFERENT" | "UNSURE";
  match_score: 0 | 1 | 2;
  notes: string;
};

export type BatchRunMetrics = {
  count_same: number;
  count_diff: number;
  count_unsure: number;
  avg_conf_same: number | null;
  avg_conf_diff: number | null;
  avg_conf_unsure: number | null;
  duration_ms: number;
};

export type BatchRunResult = {
  updates: MatchResultUpdate[];
  metrics: BatchRunMetrics;
};

/**
 * Extract confidence from notes like:
 *   "confidence=0.87; some explanation..."
 */
export function parseConfidence(notes: string): number | null {
  if (!notes) return null;
  const m = notes.match(/confidence\s*=\s*(0\.\d+|1(?:\.0+)?)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Try to grab text from either a plain string or the new
 * "array of content parts" format that some models use.
 */
function extractTextFromMessageContent(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (!part) return "";
        // OpenAI multimodal format: { type: "text", text: { value: "..." } } OR { type: "output_text", text: "..." }
        if (typeof part === "string") return part;
        if (typeof part.text === "string") return part.text;
        if (part.text && typeof part.text.value === "string") return part.text.value;
        return "";
      })
      .filter(Boolean);
    return textParts.join("\n");
  }
  return "";
}

/**
 * Very small helper: try to salvage JSON even if the model wraps it in ```json fences.
 */
function cleanJsonFromContent(content: string): string {
  let txt = content.trim();
  if (txt.startsWith("```")) {
    // Strip ```json ... ```
    txt = txt.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
  }
  return txt;
}

/**
 * Fallback extraction if JSON.parse fails badly.
 * We try to recover verdict / match_score / notes with regexes.
 */
function heuristicExtract(content: string): Partial<LlmMatchOutput> | null {
  const verdictMatch = content.match(
    /"verdict"\s*:\s*"(SAME|DIFFERENT|UNSURE)"/i
  );
  const scoreMatch = content.match(/"match_score"\s*:\s*(0|1|2)/i);
  const notesMatch = content.match(/"notes"\s*:\s*"([^"]*)"/i);

  if (!verdictMatch && !scoreMatch && !notesMatch) return null;

  const verdict = verdictMatch
    ? (verdictMatch[1].toUpperCase() as LlmMatchOutput["verdict"])
    : undefined;
  const match_score = scoreMatch
    ? (Number(scoreMatch[1]) as LlmMatchOutput["match_score"])
    : undefined;
  const notes = notesMatch ? notesMatch[1] : undefined;

  return { verdict, match_score, notes };
}

/**
 * Read numeric config from Config sheet, with sane defaults and clamping.
 */
function getNumericConfig(
  config: Record<string, string>,
  key: string,
  fallback: number,
  min?: number,
  max?: number
): number {
  const raw = config[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  let n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decide if an error is worth retrying (429, 5xx, transport issues, or "empty content").
 * We avoid retrying 400-style invalid-request errors to prevent wasting tokens.
 */
function isRetryableError(err: any): boolean {
  const status = (err && (err.status ?? err.statusCode)) as number | undefined;
  const message = String(err?.message || "");

  if (status === 429) return true; // rate limit
  if (status && status >= 500 && status < 600) return true; // server errors

  if (message.includes("Empty content from model")) return true;

  // Very generic: network-ish errors that often recover on retry
  if (
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND")
  ) {
    return true;
  }

  return false;
}

/**
 * Single attempt to get JSON-ish text from the model.
 * 1) Try Chat Completions (simple, cheap)
 * 2) If it returns empty or errors, fall back to Responses API
 *
 * We intentionally do NOT send temperature / max_tokens here to avoid
 * "unsupported parameter" issues on newer mini models.
 */
async function callModelForJsonOnce(
  model: string,
  systemContent: string,
  userContent: string
): Promise<string> {
  // 1) Chat Completions
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      // no temperature / max_tokens
    } as any);

    const message = completion.choices?.[0]?.message;
    const content = extractTextFromMessageContent(message?.content).trim();

    if (content) {
      return content;
    }

    console.warn(
      "[LLM Match] Chat completions returned empty content; falling back to Responses API."
    );
  } catch (err) {
    console.warn(
      "[LLM Match] Chat completions error; falling back to Responses API.",
      err
    );
  }

  // 2) Responses API
  const resp = await client.responses.create({
    model,
    input: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    // no temperature / max_output_tokens
  } as any);

  const outputText =
    (resp as any).output_text ??
    (Array.isArray((resp as any).output)
      ? (resp as any).output
          .map((o: any) =>
            Array.isArray(o.content)
              ? o.content
                  .map(
                    (c: any) =>
                      c?.text ??
                      c?.text?.value ??
                      ""
                  )
                  .join("\n")
              : ""
          )
          .join("\n")
      : "");

  const finalText = (outputText || "").toString().trim();

  if (!finalText) {
    throw new Error("Empty content from model (chat + responses both returned nothing)");
  }

  return finalText;
}

/**
 * Same as callModelForJsonOnce, but with controlled retries and backoff.
 * Driven by Config:
 *  - MAX_RETRIES (0–3)
 *  - RATE_LIMIT_DELAY_MS (base delay, 0–5000 ms)
 */
async function callModelForJsonWithRetry(
  model: string,
  systemContent: string,
  userContent: string,
  config: Record<string, string>
): Promise<string> {
  const maxRetries = getNumericConfig(config, "MAX_RETRIES", 1, 0, 3);
  const baseDelayMs = getNumericConfig(
    config,
    "RATE_LIMIT_DELAY_MS",
    250,
    0,
    5000
  );

  let attempt = 0;

  while (true) {
    try {
      return await callModelForJsonOnce(model, systemContent, userContent);
    } catch (err: any) {
      attempt += 1;

      if (!isRetryableError(err) || attempt > maxRetries) {
        // Non-retryable or out of budget: bubble up
        throw err;
      }

      const jitter = 0.85 + Math.random() * 0.3; // 0.85–1.15
      const delay = baseDelayMs * attempt * jitter;
      console.warn(
        `[LLM Match] Retryable error (attempt ${attempt}/${maxRetries}) – waiting ~${Math.round(
          delay
        )}ms before retry`,
        err?.message || err
      );
      await sleep(delay);
    }
  }
}

/**
 * Call OpenAI for a single row, get back structured verdict/match_score/notes.
 *
 * We:
 *  - Build system+user prompt
 *  - Get raw JSON text (with retry) via Chat/Responses
 *  - Parse JSON robustly, with a regex-based salvage fallback
 *  - If everything fails, we return an UNSURE fallback with an error message
 */
export async function runLlmMatchForRow(
  row: DatasetRow,
  config: Record<string, string>
): Promise<LlmMatchOutput> {
  const rawModel = config["MODEL"] || "gpt-5-mini";
  const model = rawModel.trim(); // avoid stray spaces from sheet / UI

  const promptTemplate =
    config["PROMPT_TEMPLATE"] ||
    "You are a high-precision matcher for UK food businesses. Decide if two records refer to the same physical location. Prefer high precision on SAME (avoid false duplicates).";

  const distanceStr =
    row.distanceMeters != null ? `${row.distanceMeters}m` : "unknown";

  const systemContent = `
${promptTemplate.trim()}

You must:
- Prefer high precision on SAME (avoid false positives for duplicates).
- Use UNSURE when evidence is genuinely ambiguous.
- Keep notes short and helpful for a human reviewer (one short sentence if possible).
`.trim();

  const userContent = `
Decide if these two records refer to the SAME, DIFFERENT, or UNSURE physical place.

Record 1:
- id: ${row.id1}
- name: ${row.name1}
- address: ${row.address1}
- link: ${row.link1 ?? "n/a"}

Record 2:
- id: ${row.id2}
- name: ${row.name2}
- address: ${row.address2}
- link: ${row.link2 ?? "n/a"}

Approx distance (meters): ${distanceStr}

Output **ONLY** a JSON object with this exact shape (no extra text):

{
  "verdict": "SAME" | "DIFFERENT" | "UNSURE",
  "match_score": 1 | 0 | 2,
  "notes": "confidence=0.xx; short explanation"
}

Rules:
- "match_score" must be 1 if verdict is "SAME", 0 if "DIFFERENT", 2 if "UNSURE".
- "notes" must start with "confidence=0.xx;" (two decimal places, 0.00–1.00), then a brief explanation.
- Do not include any extra fields.
- Do NOT wrap the JSON in backticks, markdown code fences, or natural language.
`.trim();

  try {
    const rawContent = await callModelForJsonWithRetry(
      model,
      systemContent,
      userContent,
      config
    );

    const cleaned = cleanJsonFromContent(rawContent);

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try heuristic extraction if strict parse fails
      const heuristic = heuristicExtract(cleaned);
      if (
        heuristic &&
        heuristic.verdict &&
        heuristic.match_score != null &&
        heuristic.notes
      ) {
        return {
          verdict: heuristic.verdict,
          match_score: heuristic.match_score,
          notes: heuristic.notes,
        } as LlmMatchOutput;
      }

      throw new Error(
        `Model returned non-JSON or badly formatted JSON: ${String(rawContent).slice(
          0,
          200
        )}`
      );
    }

    const verdict = parsed.verdict as LlmMatchOutput["verdict"];
    const match_score = parsed.match_score as LlmMatchOutput["match_score"];
    const notes = typeof parsed.notes === "string" ? parsed.notes : "";

    if (
      !["SAME", "DIFFERENT", "UNSURE"].includes(verdict) ||
      ![0, 1, 2].includes(match_score) ||
      !notes
    ) {
      throw new Error("Model output missing required fields");
    }

    return { verdict, match_score, notes };
  } catch (err: any) {
    console.error("OpenAI error for row", row.rowIndex, err);

    // Fallback: mark as UNSURE with low confidence, so we don't hard-fail the batch
    return {
      verdict: "UNSURE",
      match_score: 2,
      notes: `confidence=0.50; Fallback UNSURE due to error: ${
        err?.message ?? "unknown error"
      }`,
    };
  }
}

/**
 * Run many rows with limited parallelism and compute metrics.
 *
 * Same structure as your original implementation, just calls the new
 * runLlmMatchForRow with retry.
 */
export async function runLlmMatchBatch(
  rows: DatasetRow[],
  config: Record<string, string>,
  options?: { parallel?: number }
): Promise<BatchRunResult> {
  const start = Date.now();
  const parallel = Math.max(1, options?.parallel ?? 8);
  const updates: MatchResultUpdate[] = [];

  // simple index-based worker pool
  let index = 0;
  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= rows.length) break;
      const row = rows[i];

      const result = await runLlmMatchForRow(row, config);
      updates.push({
        rowIndex: row.rowIndex,
        match_score: result.match_score,
        verdict: result.verdict,
        notes: result.notes,
      });
    }
  };

  const workerCount = Math.min(parallel, rows.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // Compute metrics
  let count_same = 0;
  let count_diff = 0;
  let count_unsure = 0;

  let sum_conf_same = 0;
  let n_conf_same = 0;
  let sum_conf_diff = 0;
  let n_conf_diff = 0;
  let sum_conf_unsure = 0;
  let n_conf_unsure = 0;

  for (const u of updates) {
    const c = parseConfidence(u.notes);

    if (u.verdict === "SAME") {
      count_same++;
      if (c != null) {
        sum_conf_same += c;
        n_conf_same++;
      }
    } else if (u.verdict === "DIFFERENT") {
      count_diff++;
      if (c != null) {
        sum_conf_diff += c;
        n_conf_diff++;
      }
    } else if (u.verdict === "UNSURE") {
      count_unsure++;
      if (c != null) {
        sum_conf_unsure += c;
        n_conf_unsure++;
      }
    }
  }

  const metrics: BatchRunMetrics = {
    count_same,
    count_diff,
    count_unsure,
    avg_conf_same: n_conf_same ? sum_conf_same / n_conf_same : null,
    avg_conf_diff: n_conf_diff ? sum_conf_diff / n_conf_diff : null,
    avg_conf_unsure: n_conf_unsure ? sum_conf_unsure / n_conf_unsure : null,
    duration_ms: Date.now() - start,
  };

  return { updates, metrics };
}
