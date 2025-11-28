"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

// Read default from env; fallback to your current test sheet.
const DEFAULT_SHEET_ID =
  process.env.NEXT_PUBLIC_DEFAULT_SHEET_ID ??
  "1TtCndQtYZSCMzTzDvLqBlb3YiBRQPF0xq3xI7KKNcKg";

type Mode = "prod" | "test";

type StatusResponse = {
  sheetId: string;
  tabName: string;
  total: number;
  completed: number;
};

type StartMetrics = {
  count_same: number;
  count_diff: number;
  count_unsure: number;
  avg_conf_same: number | null;
  avg_conf_diff: number | null;
  avg_conf_unsure: number | null;
  duration_ms: number;
};

type TestingMetrics = {
  totalLabelled: number;
  totalEvaluated: number;
  correct: number;
  wrong: number;
  unsure: number;
  strict_accuracy: number | null;
  coverage: number | null;
};

type StartResponse = {
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

type ConfigResponse = {
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

type RunHistoryRow = {
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

type ReviewItem = {
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

// Known models for dropdown
const KNOWN_MODELS = [
  {
    id: "gpt-5-nano",
    label: "gpt-5-nano (cheapest, high-throughput)",
  },
  {
    id: "gpt-5-mini",
    label: "gpt-5-mini (default – cost-optimized reasoning)",
  },
  {
    id: "gpt-4o-mini",
    label: "gpt-4o-mini (cheap, very fast)",
  },
  {
    id: "gpt-4.1-mini",
    label: "gpt-4.1-mini (small, big context)",
  },
  {
    id: "gpt-5.1",
    label: "gpt-5.1 (flagship – more expensive)",
  },
];

// Rough prices per 1M tokens (for estimates only)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.1": { input: 1.25, output: 10.0 },
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

type ModelSelectionMode = "known" | "custom";
type SettingsTab = "core" | "advanced";
type AnalyticsTab = "overview" | "advanced";

/**
 * Accept either a plain Sheet ID or a full Google Sheets URL and
 * return the normalized ID.
 */
function extractSheetId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  if (trimmed.includes("docs.google.com")) {
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
  }

  return trimmed;
}

export default function HomePage() {
  // User-editable text; can be ID or full URL
  const [sheetIdInput, setSheetIdInput] = useState(DEFAULT_SHEET_ID);
  // The normalized ID actually used by the app
  const sheetId = extractSheetId(sheetIdInput);

  const [tabs, setTabs] = useState<string[]>([]);
  const [tabName, setTabName] = useState<string>("");

  const [mode, setMode] = useState<Mode>("prod");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [parallel, setParallel] = useState<number>(8);
  const [limit, setLimit] = useState<number | "">("");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [lastRun, setLastRun] = useState<StartResponse | null>(null);

  const [loadingTabs, setLoadingTabs] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config state
  const [configModel, setConfigModel] = useState("");
  const [configPrompt, setConfigPrompt] = useState("");
  const [configTemperature, setConfigTemperature] = useState<number>(0);
  const [configMaxOutputTokens, setConfigMaxOutputTokens] =
    useState<number>(256);
  const [configMaxTokensPerItem, setConfigMaxTokensPerItem] =
    useState<number>(64);
  const [configBatchSize, setConfigBatchSize] = useState<number>(50);
  const [configMaxRetries, setConfigMaxRetries] = useState<number>(1);
  const [configRateLimitDelayMs, setConfigRateLimitDelayMs] =
    useState<number>(250);
  const [configEnableBatching, setConfigEnableBatching] =
    useState<boolean>(false);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [modelSelectionMode, setModelSelectionMode] =
    useState<ModelSelectionMode>("known");
  const [selectedKnownModel, setSelectedKnownModel] = useState<string>(
    KNOWN_MODELS[0]?.id ?? ""
  );
  const [customModelId, setCustomModelId] = useState("");

  const [settingsTab, setSettingsTab] = useState<SettingsTab>("core");

  const [history, setHistory] = useState<RunHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analyticsTab, setAnalyticsTab] =
    useState<AnalyticsTab>("overview");

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Apply theme
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // Sync dropdown/custom with configModel from server
  useEffect(() => {
    if (!configModel) return;
    const found = KNOWN_MODELS.find((m) => m.id === configModel);
    if (found) {
      setModelSelectionMode("known");
      setSelectedKnownModel(found.id);
      setCustomModelId("");
    } else {
      setModelSelectionMode("custom");
      setCustomModelId(configModel);
    }
  }, [configModel]);

  // Load tabs + config whenever sheetId changes
  useEffect(() => {
    if (!sheetId) return;

    async function fetchAll() {
      try {
        setLoadingTabs(true);
        setLoadingConfig(true);
        setError(null);

        const [tabsRes, configRes] = await Promise.all([
          fetch(`/api/sheet-tabs?sheetId=${encodeURIComponent(sheetId)}`),
          fetch(`/api/config?sheetId=${encodeURIComponent(sheetId)}`),
        ]);

        const tabsData = await tabsRes.json();
        if (!tabsRes.ok) {
          throw new Error(tabsData.error || "Failed to load tabs");
        }
        setTabs(tabsData.tabs || []);
        if (tabsData.tabs && tabsData.tabs.length > 0) {
          setTabName((prev) =>
            prev && tabsData.tabs.includes(prev) ? prev : tabsData.tabs[0]
          );
        } else {
          setTabName("");
        }

        const cfgData: ConfigResponse = await configRes.json();
        if (!configRes.ok) {
          throw new Error((cfgData as any).error || "Failed to load config");
        }

        setConfigModel(cfgData.model || "");
        setConfigPrompt(cfgData.promptTemplate || "");
        setConfigTemperature(cfgData.temperature ?? 0);
        setConfigMaxOutputTokens(cfgData.maxOutputTokens ?? 256);
        setConfigMaxTokensPerItem(cfgData.maxTokensPerItem ?? 64);
        setConfigBatchSize(cfgData.batchSize ?? 50);
        setConfigMaxRetries(cfgData.maxRetries ?? 1);
        setConfigRateLimitDelayMs(cfgData.rateLimitDelayMs ?? 250);
        setConfigEnableBatching(cfgData.enableBatching ?? false);
      } catch (err: any) {
        console.error("Error loading tabs/config:", err);
        setError(err.message || "Error loading tabs/config");
      } finally {
        setLoadingTabs(false);
        setLoadingConfig(false);
      }
    }

    fetchAll();
  }, [sheetId]);

  // Load status whenever tab changes
  useEffect(() => {
    if (!sheetId || !tabName) return;
    let cancelled = false;

    async function loadStatus() {
      try {
        const params = new URLSearchParams({ sheetId, tabName });
        const res = await fetch(`/api/status?${params.toString()}`);
        if (!res.ok) return;
        const data: StatusResponse = await res.json();
        if (!cancelled) setStatus(data);
      } catch (err) {
        console.warn("Initial status load error:", err);
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [sheetId, tabName]);

  // Poll status while running
  useEffect(() => {
    if (!running || !sheetId || !tabName) return;

    let cancelled = false;

    async function poll() {
      try {
        const params = new URLSearchParams({
          sheetId,
          tabName,
        });
        const res = await fetch(`/api/status?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load status");
        }

        if (!cancelled) {
          setStatus(data);
        }
      } catch (err: any) {
        console.error("Error polling status:", err);
        if (!cancelled) {
          setError(err.message || "Error polling status");
        }
      }
    }

    poll();
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running, sheetId, tabName]);

  // Load run history when sheet/mode changes
  useEffect(() => {
    if (!sheetId) return;

    async function loadHistory() {
      try {
        setLoadingHistory(true);
        const params = new URLSearchParams({
          sheetId,
          mode,
          limit: "50", // more rows to power analytics
        });
        const res = await fetch(`/api/run-history?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load run history");
        }
        setHistory(data.rows || []);
      } catch (err: any) {
        console.error("Error loading history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadHistory();
  }, [sheetId, mode]);

  async function reloadHistory() {
    if (!sheetId) return;
    const params = new URLSearchParams({
      sheetId,
      mode,
      limit: "50",
    });
    const res = await fetch(`/api/run-history?${params.toString()}`);
    const data = await res.json();
    if (res.ok) {
      setHistory(data.rows || []);
    }
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastRun(null);

    if (!sheetId) {
      setError("Please enter a valid Sheet ID or URL");
      return;
    }

    if (!tabName) {
      setError("Please select a tab");
      return;
    }

    try {
      setRunning(true);
      setStatus(null);

      const initialLimit =
        limit !== "" && Number(limit) > 0 ? Number(limit) : undefined;
      let remaining = initialLimit;

      let totalProcessed = 0;
      let totalSame = 0;
      let totalDiff = 0;
      let totalUnsure = 0;

      let sumConfSame = 0;
      let sumConfDiff = 0;
      let sumConfUnsure = 0;
      let nConfSame = 0;
      let nConfDiff = 0;
      let nConfUnsure = 0;

      let totalDurationMs = 0;
      let firstTotalPendingBefore: number | null = null;
      let lastResponse: StartResponse | null = null;

      const MAX_CALLS = 200; // safety guard

      for (let callIndex = 0; callIndex < MAX_CALLS; callIndex++) {
        const body: any = {
          sheetId,
          tabName,
          parallel,
          mode,
        };

        if (remaining !== undefined) {
          body.limit = remaining;
        }

        const res = await fetch("/api/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = (await res.json()) as StartResponse;

        if (!res.ok) {
          throw new Error((data as any).error || "Run failed");
        }

        if (firstTotalPendingBefore === null) {
          firstTotalPendingBefore = data.totalPendingBefore;
        }

        lastResponse = data;

        if (!data.processed || data.processed <= 0) {
          break;
        }

        totalProcessed += data.processed;
        totalSame += data.metrics.count_same;
        totalDiff += data.metrics.count_diff;
        totalUnsure += data.metrics.count_unsure;
        totalDurationMs += data.metrics.duration_ms;

        if (
          data.metrics.avg_conf_same !== null &&
          data.metrics.count_same > 0
        ) {
          sumConfSame +=
            data.metrics.avg_conf_same * data.metrics.count_same;
          nConfSame += data.metrics.count_same;
        }

        if (
          data.metrics.avg_conf_diff !== null &&
          data.metrics.count_diff > 0
        ) {
          sumConfDiff +=
            data.metrics.avg_conf_diff * data.metrics.count_diff;
          nConfDiff += data.metrics.count_diff;
        }

        if (
          data.metrics.avg_conf_unsure !== null &&
          data.metrics.count_unsure > 0
        ) {
          sumConfUnsure +=
            data.metrics.avg_conf_unsure * data.metrics.count_unsure;
          nConfUnsure += data.metrics.count_unsure;
        }

        if (remaining !== undefined) {
          remaining -= data.processed;
          if (remaining <= 0) {
            break;
          }
        }

        if (data.processed >= data.totalPendingBefore) {
          break;
        }
      }

      if (!lastResponse) {
        setLastRun(null);
        return;
      }

      const aggregated: StartResponse = {
        ...lastResponse,
        totalPendingBefore:
          firstTotalPendingBefore ?? lastResponse.totalPendingBefore,
        processed: totalProcessed,
        metrics: {
          count_same: totalSame,
          count_diff: totalDiff,
          count_unsure: totalUnsure,
          avg_conf_same: nConfSame > 0 ? sumConfSame / nConfSame : null,
          avg_conf_diff: nConfDiff > 0 ? sumConfDiff / nConfDiff : null,
          avg_conf_unsure:
            nConfUnsure > 0 ? sumConfUnsure / nConfUnsure : null,
          duration_ms: totalDurationMs,
        },
      };

      setLastRun(aggregated);

      const statusRes = await fetch(
        `/api/status?sheetId=${encodeURIComponent(
          sheetId
        )}&tabName=${encodeURIComponent(tabName)}`
      );
      if (statusRes.ok) {
        const statusData: StatusResponse = await statusRes.json();
        setStatus(statusData);
      }

      await reloadHistory();
    } catch (err: any) {
      console.error("Error starting run:", err);
      setError(err.message || "Error starting run");
    } finally {
      setRunning(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sheetId) {
      setError("Please enter a valid Sheet ID or URL before saving config");
      return;
    }

    try {
      setSavingConfig(true);

      let modelToSave = "";
      if (modelSelectionMode === "known") {
        modelToSave = selectedKnownModel;
      } else {
        modelToSave = customModelId.trim();
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          model: modelToSave,
          promptTemplate: configPrompt,
          temperature: configTemperature,
          maxOutputTokens: configMaxOutputTokens,
          maxTokensPerItem: configMaxTokensPerItem,
          batchSize: configBatchSize,
          maxRetries: configMaxRetries,
          rateLimitDelayMs: configRateLimitDelayMs,
          enableBatching: configEnableBatching,
        }),
      });

      const data: ConfigResponse | { error: string } = await res.json();

      if (!res.ok) {
        throw new Error((data as any).error || "Failed to save config");
      }

      const cfg = data as ConfigResponse;
      setConfigModel(cfg.model || "");
      setConfigPrompt(cfg.promptTemplate || "");
      setConfigTemperature(cfg.temperature ?? 0);
      setConfigMaxOutputTokens(cfg.maxOutputTokens ?? 256);
      setConfigMaxTokensPerItem(cfg.maxTokensPerItem ?? 64);
      setConfigBatchSize(cfg.batchSize ?? 50);
      setConfigMaxRetries(cfg.maxRetries ?? 1);
      setConfigRateLimitDelayMs(cfg.rateLimitDelayMs ?? 250);
      setConfigEnableBatching(cfg.enableBatching ?? false);
    } catch (err: any) {
      console.error("Error saving config:", err);
      setError(err.message || "Error saving config");
    } finally {
      setSavingConfig(false);
    }
  }

  async function loadReviewQueue() {
    if (!sheetId || !tabName) return;
    setReviewError(null);

    try {
      setLoadingReview(true);
      const params = new URLSearchParams({
        sheetId,
        tabName,
        maxConfidence: "0.75",
      });
      const res = await fetch(`/api/review-queue?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load review queue");
      }

      setReviewItems(data.items || []);
    } catch (err: any) {
      console.error("Error loading review queue:", err);
      setReviewError(err.message || "Error loading review queue");
    } finally {
      setLoadingReview(false);
    }
  }

  const completionPercent =
    status && status.total > 0
      ? Math.round((status.completed / status.total) * 100)
      : 0;

  const modeLabel = mode === "prod" ? "Production" : "Testing";

  // Cost estimate
  let costEstimate: string | null = null;
  const pricing = MODEL_PRICING[configModel];
  if (pricing && status) {
    const pending = Math.max(status.total - status.completed, 0);
    const rowsToRun =
      typeof limit === "number" && limit > 0
        ? Math.min(limit, pending)
        : pending;

    if (rowsToRun > 0) {
      const TOKENS_PER_ROW_ESTIMATE = 350;
      const INPUT_FRACTION = 0.7;

      const totalTokens = rowsToRun * TOKENS_PER_ROW_ESTIMATE;
      const inputTokens = totalTokens * INPUT_FRACTION;
      const outputTokens = totalTokens * (1 - INPUT_FRACTION);

      const cost =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output;

      costEstimate = `$${cost.toFixed(4)} approx for ~${rowsToRun} rows (model: ${configModel})`;
    }
  }

  // Analytics based on history
  const hasHistory = history.length > 0;
  let totalRowsHistory = 0;
  let totalSameHistory = 0;
  let totalDiffHistory = 0;
  let totalUnsureHistory = 0;
  let totalDurationHistoryMs = 0;

  if (hasHistory) {
    for (const r of history) {
      totalRowsHistory += r.rowsProcessed;
      totalSameHistory += r.count_same;
      totalDiffHistory += r.count_diff;
      totalUnsureHistory += r.count_unsure;
      totalDurationHistoryMs += r.duration_ms;
    }
  }

  const totalDecisionsHistory =
    totalSameHistory + totalDiffHistory + totalUnsureHistory;
  const avgRunDurationSec = hasHistory
    ? totalDurationHistoryMs / history.length / 1000
    : 0;
  const avgRowsPerRun = hasHistory
    ? totalRowsHistory / history.length
    : 0;
  const throughputRowsPerSec =
    totalDurationHistoryMs > 0
      ? totalRowsHistory / (totalDurationHistoryMs / 1000)
      : 0;
  const unsureRateHistory =
    totalDecisionsHistory > 0
      ? totalUnsureHistory / totalDecisionsHistory
      : 0;
  const sameRateHistory =
    totalDecisionsHistory > 0
      ? totalSameHistory / totalDecisionsHistory
      : 0;
  const diffRateHistory =
    totalDecisionsHistory > 0
      ? totalDiffHistory / totalDecisionsHistory
      : 0;

  const verdictPieData = [
    { name: "SAME", value: totalSameHistory },
    { name: "DIFFERENT", value: totalDiffHistory },
    { name: "UNSURE", value: totalUnsureHistory },
  ];

  const VERDICT_COLORS = ["#22c55e", "#f97316", "#6b7280"];

  const runSeries = history
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    .map((r, idx) => {
      const total = r.count_same + r.count_diff + r.count_unsure;
      const unsureRate = total > 0 ? (r.count_unsure / total) * 100 : 0;
      const durationSec = r.duration_ms > 0 ? r.duration_ms / 1000 : 0;
      const throughput =
        durationSec > 0 ? r.rowsProcessed / durationSec : 0;

      const tsLabel =
        r.timestamp && r.timestamp.length >= 19
          ? r.timestamp.slice(5, 19).replace("T", " ")
          : `Run ${idx + 1}`;

      return {
        index: idx + 1,
        label: tsLabel,
        rows: r.rowsProcessed,
        throughput,
        unsureRate,
        tab: r.tabName,
      };
    });

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "var(--fs-text)",
      }}
    >
      {/* Header + theme toggle */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <div>
          <h1
            style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}
          >
            FoodStyles – LLM Match
          </h1>
          <p style={{ marginBottom: 0, color: "var(--fs-muted)" }}>
            Run LLM evaluations against Google Sheets, with modes for testing
            and production.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setTheme((prev) => (prev === "light" ? "dark" : "light"))
          }
          style={{
            padding: "6px 12px",
            fontSize: "13px",
            borderRadius: "999px",
            border: "1px solid var(--fs-border)",
            backgroundColor: "var(--fs-card-bg)",
            color: "var(--fs-text)",
            cursor: "pointer",
          }}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </div>

      {/* Mode toggle */}
      <div
        style={{
          display: "inline-flex",
          borderRadius: "999px",
          border: "1px solid var(--fs-border)",
          overflow: "hidden",
          marginBottom: "16px",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <button
          type="button"
          onClick={() => setMode("prod")}
          style={{
            padding: "6px 16px",
            fontSize: "13px",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            backgroundColor:
              mode === "prod" ? "var(--fs-accent)" : "transparent",
            color: mode === "prod" ? "#ffffff" : "var(--fs-text)",
          }}
        >
          Production
        </button>
        <button
          type="button"
          onClick={() => setMode("test")}
          style={{
            padding: "6px 16px",
            fontSize: "13px",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            backgroundColor:
              mode === "test" ? "var(--fs-accent)" : "transparent",
            color: mode === "test" ? "#ffffff" : "var(--fs-text)",
          }}
        >
          Testing
        </button>
      </div>

      {/* Error box */}
      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            borderRadius: "6px",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {/* Settings card */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "8px",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Settings (Config tab)
          </h2>

          {/* Core vs Advanced toggle */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: "999px",
              border: "1px solid var(--fs-border)",
              overflow: "hidden",
              backgroundColor: "var(--fs-card-bg)",
              fontSize: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => setSettingsTab("core")}
              style={{
                padding: "4px 10px",
                cursor: "pointer",
                border: "none",
                backgroundColor:
                  settingsTab === "core"
                    ? "var(--fs-accent)"
                    : "transparent",
                color:
                  settingsTab === "core" ? "#ffffff" : "var(--fs-text)",
              }}
            >
              Core
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab("advanced")}
              style={{
                padding: "4px 10px",
                cursor: "pointer",
                border: "none",
                backgroundColor:
                  settingsTab === "advanced"
                    ? "var(--fs-accent)"
                    : "transparent",
                color:
                  settingsTab === "advanced"
                    ? "#ffffff"
                    : "var(--fs-text)",
              }}
            >
              Advanced
            </button>
          </div>
        </div>

        {loadingConfig ? (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            Loading config…
          </div>
        ) : (
          <form onSubmit={handleSaveConfig}>
            {settingsTab === "core" ? (
              <>
                {/* MODEL selection */}
                <div
                  style={{
                    marginBottom: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 500,
                    }}
                  >
                    MODEL
                  </label>

                  {/* Mode toggle for known vs custom */}
                  <div
                    style={{
                      display: "inline-flex",
                      borderRadius: "999px",
                      border: "1px solid var(--fs-border)",
                      overflow: "hidden",
                      backgroundColor: "var(--fs-card-bg)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setModelSelectionMode("known")}
                      style={{
                        padding: "4px 12px",
                        fontSize: "12px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor:
                          modelSelectionMode === "known"
                            ? "var(--fs-accent)"
                            : "transparent",
                        color:
                          modelSelectionMode === "known"
                            ? "#ffffff"
                            : "var(--fs-text)",
                      }}
                    >
                      Known models
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelSelectionMode("custom")}
                      style={{
                        padding: "4px 12px",
                        fontSize: "12px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor:
                          modelSelectionMode === "custom"
                            ? "var(--fs-accent)"
                            : "transparent",
                        color:
                          modelSelectionMode === "custom"
                            ? "#ffffff"
                            : "var(--fs-text)",
                      }}
                    >
                      Custom
                    </button>
                  </div>

                  {modelSelectionMode === "known" ? (
                    <select
                      value={selectedKnownModel}
                      onChange={(e) => setSelectedKnownModel(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        fontSize: "14px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    >
                      {KNOWN_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder="Custom model ID (exact)"
                      style={{
                        width: "100%",
                        padding: "8px",
                        fontSize: "14px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                  )}

                  <div
                    style={{ fontSize: "12px", color: "var(--fs-muted)" }}
                  >
                    Writes into the <code>MODEL</code> key in the Config
                    sheet.
                  </div>
                </div>

                {/* PROMPT_TEMPLATE */}
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  >
                    PROMPT_TEMPLATE
                  </label>
                  <textarea
                    value={configPrompt}
                    onChange={(e) => setConfigPrompt(e.target.value)}
                    rows={6}
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "13px",
                      borderRadius: "4px",
                      border: "1px solid var(--fs-border)",
                      backgroundColor: "var(--fs-bg)",
                      color: "var(--fs-text)",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                      whiteSpace: "pre-wrap",
                    }}
                  />
                  <div
                    style={{ fontSize: "12px", color: "var(--fs-muted)" }}
                  >
                    Writes into <code>PROMPT_TEMPLATE</code> in the Config
                    sheet.
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Advanced settings */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      TEMPERATURE
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={configTemperature}
                      onChange={(e) =>
                        setConfigTemperature(
                          Math.max(
                            0,
                            Math.min(1, Number(e.target.value) || 0)
                          )
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "6px",
                        fontSize: "13px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fs-muted)",
                      }}
                    >
                      Reserved for future use. Currently 0 (deterministic).
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      MAX_OUTPUT_TOKENS
                    </label>
                    <input
                      type="number"
                      min={32}
                      max={1024}
                      value={configMaxOutputTokens}
                      onChange={(e) =>
                        setConfigMaxOutputTokens(
                          Math.max(32, Number(e.target.value) || 32)
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "6px",
                        fontSize: "13px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fs-muted)",
                      }}
                    >
                      Future guardrail for Responses. Not enforced yet.
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      MAX_TOKENS_PER_ITEM
                    </label>
                    <input
                      type="number"
                      min={32}
                      max={1024}
                      value={configMaxTokensPerItem}
                      onChange={(e) =>
                        setConfigMaxTokensPerItem(
                          Math.max(32, Number(e.target.value) || 32)
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "6px",
                        fontSize: "13px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fs-muted)",
                      }}
                    >
                      Estimate of tokens per row. Used for planning / pricing.
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      BATCH_SIZE (rows per function call)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={200}
                      value={configBatchSize}
                      onChange={(e) =>
                        setConfigBatchSize(
                          Math.max(10, Number(e.target.value) || 10)
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "6px",
                        fontSize: "13px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fs-muted)",
                      }}
                    >
                      Per-call cap so each run fits within Vercel timeouts.
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      MAX_RETRIES
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={configMaxRetries}
                      onChange={(e) =>
                        setConfigMaxRetries(
                          Math.max(
                            0,
                            Math.min(3, Number(e.target.value) || 0)
                          )
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "6px",
                        fontSize: "13px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fs-muted)",
                      }}
                    >
                      Retries for 429 / 5xx / empty responses. 1–2 is enough.
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      RATE_LIMIT_DELAY_MS
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={configRateLimitDelayMs}
                      onChange={(e) =>
                        setConfigRateLimitDelayMs(
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "6px",
                        fontSize: "13px",
                        borderRadius: "4px",
                        border: "1px solid var(--fs-border)",
                        backgroundColor: "var(--fs-bg)",
                        color: "var(--fs-text)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fs-muted)",
                      }}
                    >
                      Base delay for backoff when retries happen.
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      ENABLE_BATCHING
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={configEnableBatching}
                        onChange={(e) =>
                          setConfigEnableBatching(e.target.checked)
                        }
                      />
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--fs-muted)",
                        }}
                      >
                        Reserved for future OpenAI Batch API overnight runs.
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={savingConfig}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                borderRadius: "999px",
                border: "none",
                cursor: savingConfig ? "default" : "pointer",
                backgroundColor: savingConfig
                  ? "#9ca3af"
                  : "var(--fs-accent)",
                color: "#fff",
              }}
            >
              {savingConfig ? "Saving…" : "Save config"}
            </button>
          </form>
        )}
      </section>

      {/* Controls card */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          Run controls – {modeLabel}
        </h2>

        <form onSubmit={handleRun}>
          {/* Sheet ID (editable) */}
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                marginBottom: "4px",
              }}
            >
              Sheet ID or URL
            </label>
            <input
              type="text"
              value={sheetIdInput}
              onChange={(e) => setSheetIdInput(e.target.value)}
              placeholder="Paste Sheet ID or full Google Sheets URL"
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "13px",
                borderRadius: "4px",
                border: "1px solid var(--fs-border)",
                backgroundColor: "var(--fs-bg)",
                color: "var(--fs-text)",
              }}
            />
            <div style={{ fontSize: "12px", color: "var(--fs-muted)" }}>
              We extract the ID from the URL, so you can paste the whole link
              from the browser.
            </div>
          </div>

          {/* Tab picker */}
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                marginBottom: "4px",
              }}
            >
              Dataset tab
            </label>
            {!sheetId ? (
              <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
                Enter a Sheet ID or URL above to load tabs.
              </div>
            ) : loadingTabs ? (
              <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
                Loading tabs…
              </div>
            ) : (
              <select
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  border: "1px solid var(--fs-border)",
                  backgroundColor: "var(--fs-card-bg)",
                  color: "var(--fs-text)",
                }}
              >
                {tabs.length === 0 && (
                  <option value="">No dataset tabs found</option>
                )}
                {tabs.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Parallel and limit */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "8px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 150px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}
              >
                Parallelism
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={parallel}
                onChange={(e) =>
                  setParallel(
                    Math.max(1, Math.min(20, Number(e.target.value) || 1))
                  )
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  border: "1px solid var(--fs-border)",
                  backgroundColor: "var(--fs-card-bg)",
                  color: "var(--fs-text)",
                }}
              />
              <div style={{ fontSize: "12px", color: "var(--fs-muted)" }}>
                How many OpenAI calls at once (1–20).
              </div>
            </div>

            <div style={{ flex: "1 1 150px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}
              >
                Limit (optional)
              </label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => {
                  const val = e.target.value;
                  setLimit(val === "" ? "" : Number(val));
                }}
                placeholder="All pending"
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  border: "1px solid var(--fs-border)",
                  backgroundColor: "var(--fs-card-bg)",
                  color: "var(--fs-text)",
                }}
              />
              <div style={{ fontSize: "12px", color: "var(--fs-muted)" }}>
                Max rows to process this run (blank = all pending).
              </div>
            </div>
          </div>

          {/* Cost estimate */}
          <div
            style={{
              marginBottom: "16px",
              fontSize: "12px",
              color: "var(--fs-muted)",
            }}
          >
            {pricing && status ? (
              <>
                Estimated cost for this run{" "}
                {costEstimate ? (
                  <span>
                    (<strong>{costEstimate}</strong>)
                  </span>
                ) : (
                  "n/a"
                )}
                . Rough estimate – real billing may differ.
              </>
            ) : (
              <>
                Cost estimate: n/a (no pricing mapped for current MODEL "
                {configModel || "?"}").
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={!tabName || running || !sheetId}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              borderRadius: "999px",
              border: "none",
              cursor: running ? "default" : "pointer",
              backgroundColor: running ? "#9ca3af" : "var(--fs-accent)",
              color: "#fff",
            }}
          >
            {running ? "Running…" : "Run LLM Match"}
          </button>
        </form>
      </section>

      {/* Status card */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          Status
        </h2>

        {status ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                fontSize: "14px",
              }}
            >
              <span>
                Tab: <strong>{status.tabName}</strong>
              </span>
              <span>
                {status.completed} / {status.total} rows
              </span>
            </div>
            <div
              style={{
                height: "10px",
                borderRadius: "999px",
                backgroundColor: "#e5e7eb",
                overflow: "hidden",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: `${completionPercent}%`,
                  height: "100%",
                  backgroundColor: "#22c55e",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
              {completionPercent}% complete
            </div>
          </>
        ) : (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            No status yet. Run a job to see progress.
          </div>
        )}
      </section>

      {/* Last run – clean summary only */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          Last run (this browser session)
        </h2>

        {lastRun ? (
          <>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>
              Mode:{" "}
              <strong>
                {lastRun.mode === "prod" ? "Production" : "Testing"}
              </strong>
              . Processed <strong>{lastRun.processed}</strong> of{" "}
              <strong>{lastRun.totalPendingBefore}</strong> pending rows on{" "}
              <strong>{lastRun.tabName}</strong> with parallelism{" "}
              <strong>{lastRun.parallelism}</strong>.
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                fontSize: "13px",
                color: "var(--fs-text)",
                marginBottom: "8px",
              }}
            >
              <div>
                SAME: <strong>{lastRun.metrics.count_same}</strong>
              </div>
              <div>
                DIFFERENT: <strong>{lastRun.metrics.count_diff}</strong>
              </div>
              <div>
                UNSURE: <strong>{lastRun.metrics.count_unsure}</strong>
              </div>
              <div>
                Duration:{" "}
                <strong>
                  {(lastRun.metrics.duration_ms / 1000).toFixed(1)}s
                </strong>
              </div>
            </div>

            {lastRun.mode === "test" && lastRun.testingMetrics && (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--fs-text)",
                  marginBottom: "8px",
                }}
              >
                <div style={{ marginBottom: "4px" }}>
                  Testing (LLM Result vs confirmed):
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div>
                    Correct:{" "}
                    <strong>{lastRun.testingMetrics.correct}</strong>
                  </div>
                  <div>
                    Wrong: <strong>{lastRun.testingMetrics.wrong}</strong>
                  </div>
                  <div>
                    Unsure:{" "}
                    <strong>{lastRun.testingMetrics.unsure}</strong>
                  </div>
                  <div>
                    Labelled:{" "}
                    <strong>
                      {lastRun.testingMetrics.totalLabelled}
                    </strong>
                  </div>
                  <div>
                    Strict accuracy (excl. UNSURE):{" "}
                    <strong>
                      {lastRun.testingMetrics.strict_accuracy !== null
                        ? `${(
                            lastRun.testingMetrics.strict_accuracy *
                            100
                          ).toFixed(1)}%`
                        : "n/a"}
                    </strong>
                  </div>
                  <div>
                    Coverage (excl. UNSURE):{" "}
                    <strong>
                      {lastRun.testingMetrics.coverage !== null
                        ? `${(
                            lastRun.testingMetrics.coverage * 100
                          ).toFixed(1)}%`
                        : "n/a"}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
              Sample updates:
            </div>
            <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
              {lastRun.sampleUpdates.map((u) => (
                <li key={u.rowIndex} style={{ marginBottom: "4px" }}>
                  Row {u.rowIndex}:{" "}
                  <strong>
                    {u.verdict} (score {u.match_score})
                  </strong>
                  {u.notes ? ` — ${u.notes}` : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            No runs yet in this session.
          </div>
        )}
      </section>

      {/* Analytics dashboard – overview + advanced */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "8px",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Analytics – {modeLabel}
          </h2>

          <div
            style={{
              display: "inline-flex",
              borderRadius: "999px",
              border: "1px solid var(--fs-border)",
              overflow: "hidden",
              backgroundColor: "var(--fs-card-bg)",
              fontSize: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => setAnalyticsTab("overview")}
              style={{
                padding: "4px 10px",
                cursor: "pointer",
                border: "none",
                backgroundColor:
                  analyticsTab === "overview"
                    ? "var(--fs-accent)"
                    : "transparent",
                color:
                  analyticsTab === "overview"
                    ? "#ffffff"
                    : "var(--fs-text)",
              }}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setAnalyticsTab("advanced")}
              style={{
                padding: "4px 10px",
                cursor: "pointer",
                border: "none",
                backgroundColor:
                  analyticsTab === "advanced"
                    ? "var(--fs-accent)"
                    : "transparent",
                color:
                  analyticsTab === "advanced"
                    ? "#ffffff"
                    : "var(--fs-text)",
              }}
            >
              Advanced
            </button>
          </div>
        </div>

        {!hasHistory ? (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            No historical runs yet. Once you run a few jobs, this dashboard will
            summarize performance across runs.
          </div>
        ) : analyticsTab === "overview" ? (
          <>
            {/* KPI row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  fontSize: "12px",
                  backgroundColor: "var(--fs-bg)",
                }}
              >
                <div
                  style={{
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Total rows processed
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600 }}>
                  {totalRowsHistory}
                </div>
              </div>

              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  fontSize: "12px",
                  backgroundColor: "var(--fs-bg)",
                }}
              >
                <div
                  style={{
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Avg rows / run
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600 }}>
                  {avgRowsPerRun.toFixed(1)}
                </div>
              </div>

              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  fontSize: "12px",
                  backgroundColor: "var(--fs-bg)",
                }}
              >
                <div
                  style={{
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Throughput (rows / sec)
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600 }}>
                  {throughputRowsPerSec.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  fontSize: "12px",
                  backgroundColor: "var(--fs-bg)",
                }}
              >
                <div
                  style={{
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Avg run duration (sec)
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600 }}>
                  {avgRunDurationSec.toFixed(1)}
                </div>
              </div>

              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  fontSize: "12px",
                  backgroundColor: "var(--fs-bg)",
                }}
              >
                <div
                  style={{
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  UNSURE rate
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600 }}>
                  {(unsureRateHistory * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Charts row: pie + bar/line */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "16px",
              }}
            >
              {/* Pie chart */}
              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  backgroundColor: "var(--fs-bg)",
                  minHeight: "260px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Verdict distribution (SAME / DIFFERENT / UNSURE)
                </div>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={verdictPieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={80}
                        label={({ name, percent }) => {
                          const pct = percent ?? 0;
                          return `${name} ${(pct * 100).toFixed(0)}%`;
                        }}
                      >
                        {verdictPieData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={VERDICT_COLORS[index % VERDICT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bar + line chart per run */}
              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  backgroundColor: "var(--fs-bg)",
                  minHeight: "260px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Rows vs throughput per run
                </div>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={runSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="index" />
                      <YAxis yAxisId="left" />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(v) => v.toFixed(1)}
                      />
                      <Tooltip />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="rows"
                        name="Rows"
                        fill="#3b82f6"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="throughput"
                        name="Rows/sec"
                        stroke="#22c55e"
                        dot={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Advanced: bubble chart + table */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.1fr)",
                gap: "16px",
              }}
            >
              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  backgroundColor: "var(--fs-bg)",
                  minHeight: "260px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Bubble chart – throughput vs UNSURE% (bubble size =
                  rows)
                </div>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="throughput"
                        name="Rows/sec"
                        tickFormatter={(v) => v.toFixed(1)}
                      />
                      <YAxis
                        type="number"
                        dataKey="unsureRate"
                        name="UNSURE %"
                      />
                      <ZAxis
                        type="number"
                        dataKey="rows"
                        range={[60, 400]}
                        name="Rows"
                      />
                      <Tooltip
                        formatter={(value: any, name: any) => {
                          if (name === "unsureRate") {
                            return [`${(value as number).toFixed(1)}%`, name];
                          }
                          if (name === "throughput") {
                            return [`${(value as number).toFixed(2)}`, name];
                          }
                          return [value, name];
                        }}
                        labelFormatter={(_, payload) => {
                          if (!payload || payload.length === 0) return "";
                          const p = payload[0].payload as any;
                          return p.label || `Run ${p.index}`;
                        }}
                      />
                      <Scatter
                        name="Run"
                        data={runSeries}
                        fill="#3b82f6"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--fs-border)",
                  padding: "8px 10px",
                  backgroundColor: "var(--fs-bg)",
                  maxHeight: "260px",
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    marginBottom: "4px",
                    color: "var(--fs-muted)",
                  }}
                >
                  Per-run details
                </div>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "11px",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "4px",
                        }}
                      >
                        #
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "4px",
                        }}
                      >
                        Rows
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "4px",
                        }}
                      >
                        Rows/sec
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "4px",
                        }}
                      >
                        UNSURE %
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "4px",
                        }}
                      >
                        Tab
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runSeries
                      .slice()
                      .reverse()
                      .map((r) => (
                        <tr key={r.index}>
                          <td
                            style={{
                              padding: "4px",
                              borderTop: "1px solid var(--fs-border)",
                            }}
                          >
                            {r.index}
                          </td>
                          <td
                            style={{
                              padding: "4px",
                              borderTop: "1px solid var(--fs-border)",
                            }}
                          >
                            {r.rows}
                          </td>
                          <td
                            style={{
                              padding: "4px",
                              borderTop: "1px solid var(--fs-border)",
                              textAlign: "right",
                            }}
                          >
                            {r.throughput.toFixed(2)}
                          </td>
                          <td
                            style={{
                              padding: "4px",
                              borderTop: "1px solid var(--fs-border)",
                              textAlign: "right",
                            }}
                          >
                            {r.unsureRate.toFixed(1)}%
                          </td>
                          <td
                            style={{
                              padding: "4px",
                              borderTop: "1px solid var(--fs-border)",
                            }}
                          >
                            {r.tab}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Run history (raw log table) */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          Raw run log – {modeLabel}
        </h2>
        {loadingHistory ? (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            Loading history…
          </div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            No runs logged yet in this mode.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px" }}>Time</th>
                <th style={{ textAlign: "left", padding: "4px" }}>Tab</th>
                <th style={{ textAlign: "left", padding: "4px" }}>Model</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Rows</th>
                <th style={{ textAlign: "right", padding: "4px" }}>S/D/U</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Sec</th>
              </tr>
            </thead>
            <tbody>
              {history
                .slice()
                .reverse()
                .map((r, idx) => (
                  <tr key={idx}>
                    <td
                      style={{
                        padding: "4px",
                        borderTop: "1px solid var(--fs-border)",
                      }}
                    >
                      {r.timestamp}
                    </td>
                    <td
                      style={{
                        padding: "4px",
                        borderTop: "1px solid var(--fs-border)",
                      }}
                    >
                      {r.tabName}
                    </td>
                    <td
                      style={{
                        padding: "4px",
                        borderTop: "1px solid var(--fs-border)",
                      }}
                    >
                      {r.model}
                    </td>
                    <td
                      style={{
                        padding: "4px",
                        borderTop: "1px solid var(--fs-border)",
                        textAlign: "right",
                      }}
                    >
                      {r.rowsProcessed}
                    </td>
                    <td
                      style={{
                        padding: "4px",
                        borderTop: "1px solid var(--fs-border)",
                        textAlign: "right",
                      }}
                    >
                      {r.count_same}/{r.count_diff}/{r.count_unsure}
                    </td>
                    <td
                      style={{
                        padding: "4px",
                        borderTop: "1px solid var(--fs-border)",
                        textAlign: "right",
                      }}
                    >
                      {(r.duration_ms / 1000).toFixed(1)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Review queue */}
      <section
        style={{
          border: "1px solid var(--fs-border)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          backgroundColor: "var(--fs-card-bg)",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          Review queue (UNSURE + low confidence)
        </h2>

        <button
          type="button"
          onClick={loadReviewQueue}
          disabled={loadingReview || !tabName || !sheetId}
          style={{
            padding: "6px 12px",
            fontSize: "13px",
            borderRadius: "999px",
            border: "none",
            cursor: loadingReview ? "default" : "pointer",
            backgroundColor: loadingReview ? "#9ca3af" : "var(--fs-accent)",
            color: "#fff",
            marginBottom: "8px",
          }}
        >
          {loadingReview ? "Loading…" : "Load review items"}
        </button>

        {reviewError && (
          <div
            style={{
              marginBottom: "8px",
              padding: "8px",
              borderRadius: "4px",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              fontSize: "12px",
            }}
          >
            {reviewError}
          </div>
        )}

        {reviewItems.length === 0 ? (
          <div style={{ fontSize: "13px", color: "var(--fs-muted)" }}>
            No review items loaded yet. Click “Load review items” to fetch
            UNSURE + low-confidence rows for this tab.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
              marginTop: "8px",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px" }}>Row</th>
                <th style={{ textAlign: "left", padding: "4px" }}>Name 1</th>
                <th style={{ textAlign: "left", padding: "4px" }}>Name 2</th>
                <th style={{ textAlign: "left", padding: "4px" }}>Verdict</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Conf</th>
              </tr>
            </thead>
            <tbody>
              {reviewItems.slice(0, 25).map((item) => (
                <tr key={item.rowIndex}>
                  <td
                    style={{
                      padding: "4px",
                      borderTop: "1px solid var(--fs-border)",
                    }}
                  >
                    {item.rowIndex}
                  </td>
                  <td
                    style={{
                      padding: "4px",
                      borderTop: "1px solid var(--fs-border)",
                    }}
                  >
                    {item.name1}
                  </td>
                  <td
                    style={{
                      padding: "4px",
                      borderTop: "1px solid var(--fs-border)",
                    }}
                  >
                    {item.name2}
                  </td>
                  <td
                    style={{
                      padding: "4px",
                      borderTop: "1px solid var(--fs-border)",
                    }}
                  >
                    {item.verdict}
                  </td>
                  <td
                    style={{
                      padding: "4px",
                      borderTop: "1px solid var(--fs-border)",
                      textAlign: "right",
                    }}
                  >
                    {item.confidence !== null
                      ? item.confidence.toFixed(2)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div
          style={{
            fontSize: "12px",
            color: "var(--fs-muted)",
            marginTop: "6px",
          }}
        >
          The queue includes all UNSURE rows plus SAME/DIFFERENT decisions with
          confidence ≤ 0.75. For now, edits happen directly in the Sheet.
        </div>
      </section>
    </main>
  );
}
