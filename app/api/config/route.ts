// app/api/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfigValues } from "@/lib/config";

export const runtime = "nodejs";

function toNumberOr<T extends number>(
  raw: string | undefined,
  fallback: T
): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * GET /api/config?sheetId=...
 * Returns a config subset for the UI.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sheetId = searchParams.get("sheetId");

    if (!sheetId) {
      return NextResponse.json(
        { error: "sheetId query param is required" },
        { status: 400 }
      );
    }

    const config = await getConfig(sheetId);

    const model = config["MODEL"] ?? "";
    const promptTemplate = config["PROMPT_TEMPLATE"] ?? "";

    const temperature = toNumberOr(config["TEMPERATURE"], 0);
    const maxOutputTokens = toNumberOr(config["MAX_OUTPUT_TOKENS"], 256);
    const maxTokensPerItem = toNumberOr(config["MAX_TOKENS_PER_ITEM"], 64);
    const batchSize = toNumberOr(config["BATCH_SIZE"], 50);
    const maxRetries = toNumberOr(config["MAX_RETRIES"], 1);
    const rateLimitDelayMs = toNumberOr(config["RATE_LIMIT_DELAY_MS"], 250);
    const enableBatching = toBoolean(config["ENABLE_BATCHING"]);

    return NextResponse.json({
      model,
      promptTemplate,
      temperature,
      maxOutputTokens,
      maxTokensPerItem,
      batchSize,
      maxRetries,
      rateLimitDelayMs,
      enableBatching,
    });
  } catch (err: any) {
    console.error("Error in GET /api/config:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error reading config" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config
 * Body:
 * {
 *   sheetId: string;
 *   model?: string;
 *   promptTemplate?: string;
 *   temperature?: number;
 *   maxOutputTokens?: number;
 *   maxTokensPerItem?: number;
 *   batchSize?: number;
 *   maxRetries?: number;
 *   rateLimitDelayMs?: number;
 *   enableBatching?: boolean;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sheetId,
      model,
      promptTemplate,
      temperature,
      maxOutputTokens,
      maxTokensPerItem,
      batchSize,
      maxRetries,
      rateLimitDelayMs,
      enableBatching,
    } = body || {};

    if (!sheetId) {
      return NextResponse.json(
        { error: "sheetId is required" },
        { status: 400 }
      );
    }

    const updates: Record<string, string> = {};

    if (typeof model === "string") {
      updates["MODEL"] = model;
    }
    if (typeof promptTemplate === "string") {
      updates["PROMPT_TEMPLATE"] = promptTemplate;
    }
    if (typeof temperature === "number" && Number.isFinite(temperature)) {
      updates["TEMPERATURE"] = String(temperature);
    }
    if (
      typeof maxOutputTokens === "number" &&
      Number.isFinite(maxOutputTokens)
    ) {
      updates["MAX_OUTPUT_TOKENS"] = String(maxOutputTokens);
    }
    if (
      typeof maxTokensPerItem === "number" &&
      Number.isFinite(maxTokensPerItem)
    ) {
      updates["MAX_TOKENS_PER_ITEM"] = String(maxTokensPerItem);
    }
    if (typeof batchSize === "number" && Number.isFinite(batchSize)) {
      updates["BATCH_SIZE"] = String(batchSize);
    }
    if (typeof maxRetries === "number" && Number.isFinite(maxRetries)) {
      updates["MAX_RETRIES"] = String(maxRetries);
    }
    if (
      typeof rateLimitDelayMs === "number" &&
      Number.isFinite(rateLimitDelayMs)
    ) {
      updates["RATE_LIMIT_DELAY_MS"] = String(rateLimitDelayMs);
    }
    if (typeof enableBatching === "boolean") {
      updates["ENABLE_BATCHING"] = enableBatching ? "1" : "0";
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Only updates keys that already exist in column A of Config (by design).
    await setConfigValues(sheetId, updates);

    // Return fresh config back to the UI
    const config = await getConfig(sheetId);

    return NextResponse.json({
      model: config["MODEL"] ?? "",
      promptTemplate: config["PROMPT_TEMPLATE"] ?? "",
      temperature: toNumberOr(config["TEMPERATURE"], 0),
      maxOutputTokens: toNumberOr(config["MAX_OUTPUT_TOKENS"], 256),
      maxTokensPerItem: toNumberOr(config["MAX_TOKENS_PER_ITEM"], 64),
      batchSize: toNumberOr(config["BATCH_SIZE"], 50),
      maxRetries: toNumberOr(config["MAX_RETRIES"], 1),
      rateLimitDelayMs: toNumberOr(config["RATE_LIMIT_DELAY_MS"], 250),
      enableBatching: toBoolean(config["ENABLE_BATCHING"]),
    });
  } catch (err: any) {
    console.error("Error in POST /api/config:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error updating config" },
      { status: 500 }
    );
  }
}
