// app/api/run-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readRunHistory, type RunHistoryRow } from "@/lib/sheets";

export const runtime = "nodejs";

/**
 * GET /api/run-history?sheetId=...&mode=prod|test&limit=50&group=logical|chunks
 *
 * Why grouping exists:
 * - Your UI calls /api/start repeatedly because the backend caps each call to BATCH_SIZE (default 50)
 * - Each /api/start call appends a row into "Runs - prod/test"
 * - The analytics UI reads run history and charts "per run"
 *   => but "run" is really "chunk" today, so charts look odd (lots of 50s).
 *
 * This endpoint now defaults to returning "logical" runs by grouping consecutive chunk logs
 * into a single aggregated run (no changes to processing performance).
 *
 * Use group=chunks to get the raw per-chunk logs exactly as written to the sheet.
 */

function toEpochMs(ts: string): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

function sameRunKey(a: RunHistoryRow, b: RunHistoryRow): boolean {
  return (
    a.sheetId === b.sheetId &&
    a.tabName === b.tabName &&
    a.mode === b.mode &&
    a.model === b.model
  );
}

function groupLogicalRuns(
  rows: RunHistoryRow[],
  gapMs: number
): Array<RunHistoryRow & { chunks: number; endedAt: string }> {
  if (!rows.length) return [];

  // Ensure chronological order
  const sorted = rows
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  type Group = {
    base: RunHistoryRow;
    chunks: number;
    endedAt: string;

    // totals
    rowsProcessed: number;
    count_same: number;
    count_diff: number;
    count_unsure: number;
    duration_ms: number;

    // weighted confidence sums
    sum_conf_same: number;
    n_conf_same: number;
    sum_conf_diff: number;
    n_conf_diff: number;
    sum_conf_unsure: number;
    n_conf_unsure: number;

    lastTsMs: number | null;
  };

  const startGroup = (r: RunHistoryRow): Group => {
    const tsMs = toEpochMs(r.timestamp);
    return {
      base: { ...r },
      chunks: 1,
      endedAt: r.timestamp,

      rowsProcessed: r.rowsProcessed,
      count_same: r.count_same,
      count_diff: r.count_diff,
      count_unsure: r.count_unsure,
      duration_ms: r.duration_ms,

      sum_conf_same:
        r.avg_conf_same != null && r.count_same > 0 ? r.avg_conf_same * r.count_same : 0,
      n_conf_same: r.avg_conf_same != null && r.count_same > 0 ? r.count_same : 0,

      sum_conf_diff:
        r.avg_conf_diff != null && r.count_diff > 0 ? r.avg_conf_diff * r.count_diff : 0,
      n_conf_diff: r.avg_conf_diff != null && r.count_diff > 0 ? r.count_diff : 0,

      sum_conf_unsure:
        r.avg_conf_unsure != null && r.count_unsure > 0
          ? r.avg_conf_unsure * r.count_unsure
          : 0,
      n_conf_unsure: r.avg_conf_unsure != null && r.count_unsure > 0 ? r.count_unsure : 0,

      lastTsMs: tsMs,
    };
  };

  const finalize = (g: Group): RunHistoryRow & { chunks: number; endedAt: string } => {
    const avg_conf_same = g.n_conf_same > 0 ? g.sum_conf_same / g.n_conf_same : null;
    const avg_conf_diff = g.n_conf_diff > 0 ? g.sum_conf_diff / g.n_conf_diff : null;
    const avg_conf_unsure = g.n_conf_unsure > 0 ? g.sum_conf_unsure / g.n_conf_unsure : null;

    return {
      // keep the original "timestamp" as the start timestamp for labeling
      ...g.base,
      rowsProcessed: g.rowsProcessed,
      count_same: g.count_same,
      count_diff: g.count_diff,
      count_unsure: g.count_unsure,
      avg_conf_same,
      avg_conf_diff,
      avg_conf_unsure,
      duration_ms: g.duration_ms,

      // extra fields the UI can optionally use later (safe to ignore)
      chunks: g.chunks,
      endedAt: g.endedAt,
    };
  };

  const grouped: Array<RunHistoryRow & { chunks: number; endedAt: string }> = [];
  let current: Group | null = null;

  for (const r of sorted) {
    if (!current) {
      current = startGroup(r);
      continue;
    }

    const rTsMs = toEpochMs(r.timestamp);
    const canTimeCompare = current.lastTsMs != null && rTsMs != null;
    const withinGap = canTimeCompare ? rTsMs! - current.lastTsMs! <= gapMs : false;

    const shouldMerge = sameRunKey(current.base, r) && withinGap;

    if (!shouldMerge) {
      grouped.push(finalize(current));
      current = startGroup(r);
      continue;
    }

    // merge into current group
    current.chunks += 1;
    current.endedAt = r.timestamp;
    current.lastTsMs = rTsMs;

    current.rowsProcessed += r.rowsProcessed;
    current.count_same += r.count_same;
    current.count_diff += r.count_diff;
    current.count_unsure += r.count_unsure;
    current.duration_ms += r.duration_ms;

    if (r.avg_conf_same != null && r.count_same > 0) {
      current.sum_conf_same += r.avg_conf_same * r.count_same;
      current.n_conf_same += r.count_same;
    }
    if (r.avg_conf_diff != null && r.count_diff > 0) {
      current.sum_conf_diff += r.avg_conf_diff * r.count_diff;
      current.n_conf_diff += r.count_diff;
    }
    if (r.avg_conf_unsure != null && r.count_unsure > 0) {
      current.sum_conf_unsure += r.avg_conf_unsure * r.count_unsure;
      current.n_conf_unsure += r.count_unsure;
    }
  }

  if (current) grouped.push(finalize(current));
  return grouped;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sheetId = searchParams.get("sheetId");
    const modeParam = searchParams.get("mode") || "prod";
    const limitParam = searchParams.get("limit") || "10";

    // NEW: grouping mode
    const groupParam = (searchParams.get("group") || "logical").toLowerCase();
    const group = groupParam === "chunks" ? "chunks" : "logical";

    if (!sheetId) {
      return NextResponse.json(
        { error: "sheetId query param is required" },
        { status: 400 }
      );
    }

    const mode = modeParam === "test" ? "test" : "prod";
    const limit = Math.max(1, Number(limitParam) || 10);

    const rows = await readRunHistory(sheetId, mode, limit);

    if (group === "chunks") {
      return NextResponse.json({
        sheetId,
        mode,
        group,
        rows,
      });
    }

    // Heuristic: treat chunk-logs as one logical run if they are close in time.
    // 5 minutes is a safe default for "one click" runs that call /api/start multiple times.
    const GAP_MS = 5 * 60 * 1000;

    const grouped = groupLogicalRuns(rows, GAP_MS);

    return NextResponse.json({
      sheetId,
      mode,
      group,
      grouping: { gapMs: GAP_MS, rawRows: rows.length, groupedRows: grouped.length },
      rows: grouped,
    });
  } catch (err: any) {
    console.error("Error in /api/run-history:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error in /api/run-history" },
      { status: 500 }
    );
  }
}
