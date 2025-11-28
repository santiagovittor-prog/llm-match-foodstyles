// lib/sheets.ts
import { google } from "googleapis";
import type { DatasetRow } from "./types";

const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// Create an authenticated Sheets client using the service account
export async function getSheetsClient() {
  // Support both naming schemes so you don't get locked out
  const email =
    process.env.GOOGLE_CLIENT_EMAIL ??
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey =
    process.env.GOOGLE_PRIVATE_KEY ??
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    // Helpful debug output in server logs
    console.error("Missing Google service account env vars", {
      has_GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
      has_GOOGLE_SERVICE_ACCOUNT_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      has_GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
      has_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
        !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    });
    throw new Error("Missing Google service account env vars");
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [SPREADSHEETS_SCOPE],
  });

  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

// Simple helper to read any range
export async function readRange(
  sheetId: string,
  range: string
): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return (res.data.values ?? []) as string[][];
}

// List sheet tab names (excluding meta tabs)
export async function listTabs(sheetId: string): Promise<string[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });

  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter(
      (title): title is string =>
        !!title &&
        !["Config", "Logs", "Overview", "Runs - prod", "Runs - test"].includes(
          title
        )
    );
}

/**
 * Read dataset rows for evaluation from your testing/production tabs.
 *
 * Columns:
 *   A: Unnamed index (ignored)
 *   B: id1
 *   C: id2
 *   D: name1
 *   E: name2
 *   F: address1
 *   G: address2
 *   H: link1
 *   I: link2
 *   J: distance_meters
 *   K: confirmed (0/1)
 *   L: Comment (ignored)
 *   M: LLM Result (formula, ignored)
 *   N: match_score (LLM)
 *   O: verdict (LLM)
 *   P: notes (LLM)
 *
 * We return only rows where N and O are BOTH empty (pending).
 */
export async function readDatasetRows(
  sheetId: string,
  tabName: string,
  options?: { rowStart?: number; rowEnd?: number }
): Promise<DatasetRow[]> {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A2:P`,
  });

  const values = res.data.values ?? [];
  const rows: DatasetRow[] = [];

  values.forEach((row, idx) => {
    const rowIndex = idx + 2; // sheet row index (2,3,...)

    if (options?.rowStart && rowIndex < options.rowStart) return;
    if (options?.rowEnd && rowIndex > options.rowEnd) return;

    const [
      _unnamed0, // A
      id1 = "", // B
      id2 = "", // C
      name1 = "", // D
      name2 = "", // E
      address1 = "", // F
      address2 = "", // G
      link1 = "", // H
      link2 = "", // I
      distanceRaw = "", // J
      confirmedRaw = "", // K
      _comment, // L
      _llmResult, // M
      matchScoreExisting, // N
      verdictExisting, // O
      _notesExisting, // P
    ] = row;

    const hasMatchScore =
      matchScoreExisting !== undefined && matchScoreExisting !== "";
    const hasVerdict =
      verdictExisting !== undefined && verdictExisting !== "";

    // Skip rows already evaluated
    if (hasMatchScore || hasVerdict) {
      return;
    }

    const distanceMeters =
      distanceRaw && !isNaN(Number(distanceRaw))
        ? Number(distanceRaw)
        : null;

    let confirmed: 0 | 1 | null = null;
    if (confirmedRaw === "0" || confirmedRaw === "1") {
      confirmed = Number(confirmedRaw) as 0 | 1;
    }

    rows.push({
      rowIndex,
      id1: id1.toString(),
      id2: id2.toString(),
      name1: name1.toString(),
      name2: name2.toString(),
      address1: address1.toString(),
      address2: address2.toString(),
      link1: link1 || null,
      link2: link2 || null,
      distanceMeters,
      confirmed,
    });
  });

  return rows;
}

// --- Writing results back to the sheet ---

export interface MatchResultUpdate {
  rowIndex: number;
  match_score: 0 | 1 | 2;
  verdict: string;
  notes: string;
}

export async function writeMatchResults(
  sheetId: string,
  tabName: string,
  updates: MatchResultUpdate[]
): Promise<void> {
  if (!updates.length) return;

  const sheets = await getSheetsClient();

  const data = updates.map((u) => ({
    range: `${tabName}!N${u.rowIndex}:P${u.rowIndex}`,
    values: [[u.match_score, u.verdict, u.notes]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });
}

/**
 * Append a single run log row into "Runs - prod" or "Runs - test".
 *
 * rowValues = [
 *   timestamp_iso, sheet_id, tab_name, mode, model,
 *   rows_processed, count_same, count_diff, count_unsure,
 *   avg_conf_same, avg_conf_diff, avg_conf_unsure, duration_ms
 * ]
 */
export async function appendRunLog(
  sheetId: string,
  mode: "prod" | "test",
  rowValues: (string | number | null)[]
): Promise<void> {
  const sheets = await getSheetsClient();
  const logTab = mode === "test" ? "Runs - test" : "Runs - prod";

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${logTab}!A1:M1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowValues],
    },
  });
}

// --- Testing accuracy based on column M ("LLM Result") ---

export type TestingAccuracy = {
  totalLabelled: number;
  totalEvaluated: number;
  correct: number;
  wrong: number;
  unsure: number;
  strict_accuracy: number | null; // correct / (correct + wrong)
  coverage: number | null; // (correct + wrong) / totalLabelled
};

export async function computeTestingAccuracy(
  sheetId: string,
  tabName: string
): Promise<TestingAccuracy> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!K2:M`,
  });

  const values = res.data.values ?? [];

  let totalLabelled = 0;
  let totalEvaluated = 0;
  let correct = 0;
  let wrong = 0;
  let unsure = 0;

  values.forEach((row) => {
    const confirmedRaw = row[0];
    const llmResultRaw = row[2];

    if (confirmedRaw === "0" || confirmedRaw === "1") {
      totalLabelled++;

      if (llmResultRaw && llmResultRaw.toString().trim() !== "") {
        totalEvaluated++;
        const v = llmResultRaw.toString().trim().toUpperCase();

        if (v.startsWith("CORRECT")) {
          correct++;
        } else if (v.startsWith("WRONG")) {
          wrong++;
        } else if (v.startsWith("UNSURE")) {
          unsure++;
        }
      }
    }
  });

  const definite = correct + wrong;
  const strict_accuracy = definite > 0 ? correct / definite : null;
  const coverage = totalLabelled > 0 ? definite / totalLabelled : null;

  return {
    totalLabelled,
    totalEvaluated,
    correct,
    wrong,
    unsure,
    strict_accuracy,
    coverage,
  };
}

// --- Run history ---

export type RunHistoryRow = {
  timestamp: string;
  sheetId: string;
  tabName: string;
  mode: string;
  model: string;
  rowsProcessed: number;
  count_same: number;
  count_diff: number;
  count_unsure: number;
  avg_conf_same: number | null;
  avg_conf_diff: number | null;
  avg_conf_unsure: number | null;
  duration_ms: number;
};

export async function readRunHistory(
  sheetId: string,
  mode: "prod" | "test",
  limit = 10
): Promise<RunHistoryRow[]> {
  const sheets = await getSheetsClient();
  const logTab = mode === "test" ? "Runs - test" : "Runs - prod";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${logTab}!A2:M`,
  });

  const rows = res.data.values ?? [];
  if (!rows.length) return [];

  const slice = rows.slice(-limit); // last N rows

  return slice.map((row) => {
    const [
      timestamp = "",
      sId = "",
      tabName = "",
      m = "",
      model = "",
      rowsProcessed = "0",
      countSame = "0",
      countDiff = "0",
      countUnsure = "0",
      avgConfSame = "",
      avgConfDiff = "",
      avgConfUnsure = "",
      durationMs = "0",
    ] = row;

    const toNumber = (v: string): number =>
      v !== "" && !isNaN(Number(v)) ? Number(v) : 0;

    const toMaybeNumber = (v: string): number | null =>
      v !== "" && !isNaN(Number(v)) ? Number(v) : null;

    return {
      timestamp,
      sheetId: sId,
      tabName,
      mode: m,
      model,
      rowsProcessed: toNumber(rowsProcessed),
      count_same: toNumber(countSame),
      count_diff: toNumber(countDiff),
      count_unsure: toNumber(countUnsure),
      avg_conf_same: toMaybeNumber(avgConfSame),
      avg_conf_diff: toMaybeNumber(avgConfDiff),
      avg_conf_unsure: toMaybeNumber(avgConfUnsure),
      duration_ms: toNumber(durationMs),
    };
  });
}
