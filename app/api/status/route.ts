// app/api/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/sheets";

export const runtime = "nodejs";

/**
 * GET /api/status?sheetId=...&tabName=...
 *
 * We recompute progress live from the Sheet:
 *  - total = all data rows under header
 *  - completed = rows with match_score + verdict in columns N/O
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sheetId = url.searchParams.get("sheetId");
  const tabName = url.searchParams.get("tabName");

  if (!sheetId || !tabName) {
    return NextResponse.json(
      { error: "sheetId and tabName query params are required" },
      { status: 400 }
    );
  }

  try {
    const sheets = await getSheetsClient();

    // Read A2:P to inspect match_score (N) and verdict (O)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A2:P`,
    });

    const values = res.data.values ?? [];

    const total = values.length;
    let completed = 0;

    values.forEach((row) => {
      // Column indices (0-based):
      // A=0, B=1, ..., N=13, O=14, P=15
      const matchScore = row[13]; // N
      const verdict = row[14];    // O

      const hasMatchScore =
        matchScore !== undefined && matchScore !== "";
      const hasVerdict =
        verdict !== undefined && verdict !== "";

      if (hasMatchScore && hasVerdict) {
        completed += 1;
      }
    });

    return NextResponse.json({
      sheetId,
      tabName,
      total,
      completed,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message ?? "Error computing status" },
      { status: 500 }
    );
  }
}
