// app/api/test-dataset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readDatasetRows } from "@/lib/sheets";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sheetId = url.searchParams.get("sheetId");
  const tabName = url.searchParams.get("tabName");

  if (!sheetId || !tabName) {
    return NextResponse.json(
      { error: "sheetId and tabName are required" },
      { status: 400 }
    );
  }

  try {
    const rows = await readDatasetRows(sheetId, tabName);
    return NextResponse.json({
      totalPending: rows.length,
      sample: rows.slice(0, 5), // first few pending rows
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message ?? "Error reading dataset" },
      { status: 500 }
    );
  }
}
