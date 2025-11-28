// app/api/test-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sheetId = url.searchParams.get("sheetId");

  if (!sheetId) {
    return NextResponse.json(
      { error: "sheetId required" },
      { status: 400 }
    );
  }

  try {
    const config = await getConfig(sheetId);
    return NextResponse.json({ config });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message ?? "Error reading Config" },
      { status: 500 }
    );
  }
}
