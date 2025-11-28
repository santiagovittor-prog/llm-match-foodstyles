// lib/types.ts

// Verdict values the model can return
export type LlmMatchVerdict = "SAME" | "DIFFERENT" | "UNSURE";

// One row from your dataset tab, matching the current layout:
// A: Unnamed: 0 (ignored)
// B: id1
// C: id2
// D: name1
// E: name2
// F: address1
// G: address2
// H: link1
// I: link2
// J: distance_meters
// K: confirmed (0/1)
// L: Comment (ignored here)
// M: LLM Result (formula, ignored)
// N: match_score (LLM output)
// O: verdict (LLM output)
// P: notes (LLM output)
export interface DatasetRow {
  // Actual row index in the Google Sheet (1-based, including header).
  // So for the first data row under the header, rowIndex = 2.
  rowIndex: number;

  id1: string;
  id2: string;
  name1: string;
  name2: string;
  address1: string;
  address2: string;

  link1?: string | null;
  link2?: string | null;

  distanceMeters?: number | null;

  // Ground truth if present:
  // 1 = SAME, 0 = DIFFERENT, null/undefined = not labeled
  confirmed?: 0 | 1 | null;
}

// Minimal session summary used by /api/status
export interface SessionSummary {
  id: string;
  sheetId: string;
  tabName: string;
  total: number;
  completed: number;
  createdAt: number;
  finishedAt?: number;
}
