// app/api/test-sheets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readRange } from "@/lib/sheets";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get("sheetId");
  const tabName = searchParams.get("tabName") || "Config";

  if (!sheetId) {
    return NextResponse.json(
      { error: "sheetId query param is required" },
      { status: 400 }
    );
  }

  try {
    const values = await readRange(sheetId, `${tabName}!A1:D5`);
    return NextResponse.json({ sheetId, tabName, values });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message ?? "Error reading sheet" },
      { status: 500 }
    );
  }
}
