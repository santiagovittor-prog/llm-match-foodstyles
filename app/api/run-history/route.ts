// app/api/run-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readRunHistory } from "@/lib/sheets";

export const runtime = "nodejs";

/**
 * GET /api/run-history?sheetId=...&mode=prod|test&limit=10
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sheetId = searchParams.get("sheetId");
    const modeParam = searchParams.get("mode") || "prod";
    const limitParam = searchParams.get("limit") || "10";

    if (!sheetId) {
      return NextResponse.json(
        { error: "sheetId query param is required" },
        { status: 400 }
      );
    }

    const mode = modeParam === "test" ? "test" : "prod";
    const limit = Math.max(1, Number(limitParam) || 10);

    const rows = await readRunHistory(sheetId, mode, limit);

    return NextResponse.json({ sheetId, mode, rows });
  } catch (err: any) {
    console.error("Error in /api/run-history:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error in /api/run-history" },
      { status: 500 }
    );
  }
}
