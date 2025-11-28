// app/api/review-queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readRange } from "@/lib/sheets";
import { parseConfidence } from "@/lib/openai";

export const runtime = "nodejs";

type ReviewItem = {
  rowIndex: number;
  id1: string;
  id2: string;
  name1: string;
  name2: string;
  address1: string;
  address2: string;
  verdict: string;
  match_score: number | null;
  confidence: number | null;
  notes: string;
  reason: "UNSURE" | "LOW_CONF_SAME" | "LOW_CONF_DIFF";
};

/**
 * GET /api/review-queue?sheetId=...&tabName=...&maxConfidence=0.75
 *
 * Returns:
 *   - All UNSURE verdicts
 *   - SAME/DIFFERENT with confidence <= maxConfidence (borderline)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sheetId = searchParams.get("sheetId");
    const tabName = searchParams.get("tabName");
    const maxConfidenceParam = searchParams.get("maxConfidence") || "0.75";

    if (!sheetId || !tabName) {
      return NextResponse.json(
        { error: "sheetId and tabName are required" },
        { status: 400 }
      );
    }

    const maxConfidence = Math.min(
      1,
      Math.max(0, Number(maxConfidenceParam) || 0.75)
    );

    const rows = await readRange(sheetId, `${tabName}!A2:P`);
    const items: ReviewItem[] = [];

    rows.forEach((row, idx) => {
      const rowIndex = idx + 2;

      const id1 = (row[1] ?? "").toString();
      const id2 = (row[2] ?? "").toString();
      const name1 = (row[3] ?? "").toString();
      const name2 = (row[4] ?? "").toString();
      const address1 = (row[5] ?? "").toString();
      const address2 = (row[6] ?? "").toString();

      const matchScoreRaw = row[13]; // N
      const verdictRaw = row[14]; // O
      const notesRaw = row[15]; // P

      const verdict = verdictRaw ? verdictRaw.toString().trim() : "";
      const notes = notesRaw ? notesRaw.toString() : "";

      if (!verdict && !notes) return; // not evaluated

      const match_score =
        matchScoreRaw !== undefined && matchScoreRaw !== ""
          ? Number(matchScoreRaw)
          : null;

      const conf = parseConfidence(notes);
      const verdictUpper = verdict.toUpperCase();

      let reason: ReviewItem["reason"] | null = null;

      if (verdictUpper === "UNSURE") {
        reason = "UNSURE";
      } else if (conf !== null && conf <= maxConfidence) {
        if (verdictUpper === "SAME") {
          reason = "LOW_CONF_SAME";
        } else if (verdictUpper === "DIFFERENT") {
          reason = "LOW_CONF_DIFF";
        }
      }

      if (!reason) return;

      items.push({
        rowIndex,
        id1,
        id2,
        name1,
        name2,
        address1,
        address2,
        verdict: verdictUpper,
        match_score,
        confidence: conf,
        notes,
        reason,
      });
    });

    // Show least confident first
    items.sort((a, b) => {
      const ca = a.confidence ?? -1;
      const cb = b.confidence ?? -1;
      return ca - cb;
    });

    return NextResponse.json({
      sheetId,
      tabName,
      maxConfidence,
      total: items.length,
      items,
    });
  } catch (err: any) {
    console.error("Error in /api/review-queue:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error in /api/review-queue" },
      { status: 500 }
    );
  }
}
