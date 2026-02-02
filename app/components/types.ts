export type Mode = "prod" | "test";
export type HistoryGroup = "logical" | "chunks";

export type ModelSelectionMode = "known" | "custom";
export type SettingsTab = "core" | "advanced";
export type AnalyticsTab = "overview" | "advanced";

export type StatusResponse = {
  sheetId: string;
  tabName: string;
  total: number;
  completed: number;
};

export type StartMetrics = {
  count_same: number;
  count_diff: number;
  count_unsure: number;
  avg_conf_same: number | null;
  avg_conf_diff: number | null;
  avg_conf_unsure: number | null;
  duration_ms: number;
};

export type TestingMetrics = {
  totalLabelled: number;
  totalEvaluated: number;
  correct: number;
  wrong: number;
  unsure: number;
  strict_accuracy: number | null;
  coverage: number | null;
};

export type StartResponse = {
  sheetId: string;
  tabName: string;
  mode: Mode;
  totalPendingBefore: number;
  processed: number;
  parallelism: number;
  metrics: StartMetrics;
  testingMetrics?: TestingMetrics;
  sampleUpdates: {
    rowIndex: number;
    match_score: 0 | 1 | 2;
    verdict: string;
    notes: string;
  }[];
};

export type ConfigResponse = {
  model: string;
  promptTemplate: string;
  temperature: number;
  maxOutputTokens: number;
  maxTokensPerItem: number;
  batchSize: number;
  maxRetries: number;
  rateLimitDelayMs: number;
  enableBatching: boolean;
};

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

  // present when group=logical
  chunks?: number;
  endedAt?: string;
};

export type ReviewItem = {
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
};

export type AnalyticsComputed = {
  hasHistory: boolean;
  totalRows: number;
  avgRowsPerRun: number;
  throughputRowsPerSec: number;
  avgRunDurationSec: number;
  unsureRate: number;
  verdictPieData: { name: string; value: number }[];
  verdictColors: string[];
  runSeries: {
    index: number;
    label: string;
    rows: number;
    throughput: number;
    unsureRate: number;
    tab: string;
  }[];
};
