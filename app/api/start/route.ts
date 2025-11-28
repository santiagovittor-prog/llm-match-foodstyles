// app/api/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  readDatasetRows,
  writeMatchResults,
  appendRunLog,
  computeTestingAccuracy,
} from "@/lib/sheets";
import { getConfig } from "@/lib/config";
import { runLlmMatchBatch } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sheetId,
      tabName,
      parallel = 8,
      limit,
      mode = "prod",
    }: {
      sheetId: string;
      tabName: string;
      parallel?: number;
      limit?: number;
      mode?: "prod" | "test";
    } = body || {};

    if (!sheetId || !tabName) {
      return NextResponse.json(
        { error: "sheetId and tabName are required" },
        { status: 400 }
      );
    }

    const config = await getConfig(sheetId);
    const allPendingRows = await readDatasetRows(sheetId, tabName);
    const totalPendingBefore = allPendingRows.length;

    // No pending work – short-circuit
    if (totalPendingBefore === 0) {
      return NextResponse.json({
        sheetId,
        tabName,
        mode,
        totalPendingBefore,
        processed: 0,
        parallelism: parallel,
        metrics: {
          count_same: 0,
          count_diff: 0,
          count_unsure: 0,
          avg_conf_same: null,
          avg_conf_diff: null,
          avg_conf_unsure: null,
          duration_ms: 0,
        },
        testingMetrics: undefined,
        sampleUpdates: [],
      });
    }

    // Effective upper bound for this call:
    //   - optional `limit` from the caller (remaining rows for this logical run)
    //   - plus a per-call chunk size from Config.BATCH_SIZE (or fallback)
    let rowsToProcess = allPendingRows;

    // Respect limit (if provided)
    if (typeof limit === "number" && limit > 0 && rowsToProcess.length > limit) {
      rowsToProcess = rowsToProcess.slice(0, limit);
    }

    // Enforce per-call chunk size so we stay under Vercel timeouts.
    const rawBatchSize = config["BATCH_SIZE"];
    let chunkSize = 0;

    if (rawBatchSize !== undefined && rawBatchSize !== null && rawBatchSize !== "") {
      const n = Number(rawBatchSize);
      if (Number.isFinite(n) && n > 0) {
        chunkSize = Math.floor(n);
      }
    }

    if (chunkSize <= 0) {
      // Safe default for production: up to 50 rows per function call.
      chunkSize = 50;
    }

    if (rowsToProcess.length > chunkSize) {
      rowsToProcess = rowsToProcess.slice(0, chunkSize);
    }

    // If after all caps we still have nothing, return a no-op response.
    if (rowsToProcess.length === 0) {
      return NextResponse.json({
        sheetId,
        tabName,
        mode,
        totalPendingBefore,
        processed: 0,
        parallelism: parallel,
        metrics: {
          count_same: 0,
          count_diff: 0,
          count_unsure: 0,
          avg_conf_same: null,
          avg_conf_diff: null,
          avg_conf_unsure: null,
          duration_ms: 0,
        },
        testingMetrics: undefined,
        sampleUpdates: [],
      });
    }

    const { updates, metrics } = await runLlmMatchBatch(rowsToProcess, config, {
      parallel,
    });

    await writeMatchResults(sheetId, tabName, updates);

    const processed = updates.length;

    let testingMetrics = undefined;
    if (mode === "test") {
      testingMetrics = await computeTestingAccuracy(sheetId, tabName);
    }

    const now = new Date().toISOString();
    const model = config["MODEL"] || "";

    await appendRunLog(sheetId, mode, [
      now,
      sheetId,
      tabName,
      mode,
      model,
      processed,
      metrics.count_same,
      metrics.count_diff,
      metrics.count_unsure,
      metrics.avg_conf_same ?? null,
      metrics.avg_conf_diff ?? null,
      metrics.avg_conf_unsure ?? null,
      metrics.duration_ms,
    ]);

    const sampleUpdates = updates
      .slice(0, 5)
      .sort((a, b) => a.rowIndex - b.rowIndex);

    return NextResponse.json({
      sheetId,
      tabName,
      mode,
      totalPendingBefore,
      processed,
      parallelism: parallel,
      metrics,
      testingMetrics,
      sampleUpdates,
    });
  } catch (err: any) {
    console.error("Error in /api/start:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error in /api/start" },
      { status: 500 }
    );
  }
}
