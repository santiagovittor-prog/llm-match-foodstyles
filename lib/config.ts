// lib/config.ts
import { getSheetsClient, readRange } from "./sheets";

/**
 * Read Config tab (Key → Value) into a simple object.
 * Expects columns:
 *   A: Key
 *   B: Value
 *   C: Help (ignored)
 */
export async function getConfig(
  sheetId: string
): Promise<Record<string, string>> {
  const rows = await readRange(sheetId, "Config!A2:C");
  const config: Record<string, string> = {};

  for (const row of rows) {
    const key = row[0];
    const value = row[1];

    if (key) {
      config[key] = value ?? "";
    }
  }

  return config;
}

/**
 * Update one or more config keys in the Config tab.
 * Only updates keys that already exist in column A.
 */
export async function setConfigValues(
  sheetId: string,
  updates: Record<string, string>
): Promise<void> {
  const sheets = await getSheetsClient();

  // Read existing keys and their row indices
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Config!A2:B",
  });

  const rows = res.data.values ?? [];
  const keyToRowIndex = new Map<string, number>();

  rows.forEach((row, idx) => {
    const key = row[0];
    if (key) {
      keyToRowIndex.set(key.toString(), idx + 2); // row 2 = first data row
    }
  });

  const data: { range: string; values: string[][] }[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const rowIndex = keyToRowIndex.get(key);
    if (rowIndex) {
      data.push({
        range: `Config!B${rowIndex}:B${rowIndex}`,
        values: [[value]],
      });
    }
  }

  if (!data.length) {
    // nothing to update (keys not found)
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}
