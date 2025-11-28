// app/api/sheet-tabs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listTabs } from "@/lib/sheets";

export const runtime = "nodejs";

/**
 * GET /api/sheet-tabs?sheetId=...
 *
 * Returns the list of non-meta sheet tabs (excluding Config, Logs, Overview).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sheetId = url.searchParams.get("sheetId");

  if (!sheetId) {
    return NextResponse.json(
      { error: "sheetId query param is required" },
      { status: 400 }
    );
  }

  try {
    const tabs = await listTabs(sheetId);
    return NextResponse.json({ sheetId, tabs });
  } catch (err: any) {
    console.error("Error in /api/sheet-tabs:", err);
    return NextResponse.json(
      { error: err.message ?? "Error listing tabs" },
      { status: 500 }
    );
  }
}
