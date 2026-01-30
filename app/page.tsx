"use client";

import { useEffect, useMemo, useState } from "react";
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
type HistoryGroup = "logical" | "chunks";

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

  // Optional fields returned by grouped history
  chunks?: number;
  endedAt?: string;
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
  { id: "gpt-5-nano", label: "gpt-5-nano (cheapest, high throughput)" },
  { id: "gpt-5-mini", label: "gpt-5-mini (default, cost optimized reasoning)" },
  { id: "gpt-4o-mini", label: "gpt-4o-mini (cheap, very fast)" },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini (small, big context)" },
  { id: "gpt-5.1", label: "gpt-5.1 (flagship, more expensive)" },
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
 * Accept either a plain Sheet ID or a full Google Sheets URL and return the normalized ID.
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

  const [historyGroup, setHistoryGroup] =
    useState<HistoryGroup>("logical");

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
        if (!tabsRes.ok) throw new Error(tabsData.error || "Failed to load tabs");

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
        const params = new URLSearchParams({ sheetId, tabName });
        const res = await fetch(`/api/status?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load status");
        if (!cancelled) setStatus(data);
      } catch (err: any) {
        console.error("Error polling status:", err);
        if (!cancelled) setError(err.message || "Error polling status");
      }
    }

    poll();
    const id = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running, sheetId, tabName]);

  // Load run history when sheet/mode/group changes
  useEffect(() => {
    if (!sheetId) return;

    async function loadHistory() {
      try {
        setLoadingHistory(true);
        const params = new URLSearchParams({
          sheetId,
          mode,
          limit: "50",
          group: historyGroup,
        });
        const res = await fetch(`/api/run-history?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load run history");
        setHistory(data.rows || []);
      } catch (err: any) {
        console.error("Error loading history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadHistory();
  }, [sheetId, mode, historyGroup]);

  async function reloadHistory() {
    if (!sheetId) return;
    const params = new URLSearchParams({
      sheetId,
      mode,
      limit: "50",
      group: historyGroup,
    });
    const res = await fetch(`/api/run-history?${params.toString()}`);
    const data = await res.json();
    if (res.ok) setHistory(data.rows || []);
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastRun(null);

    if (!sheetId) return setError("Please enter a valid Sheet ID or link");
    if (!tabName) return setError("Please select a dataset tab");

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

      const MAX_CALLS = 200;

      for (let callIndex = 0; callIndex < MAX_CALLS; callIndex++) {
        const body: any = { sheetId, tabName, parallel, mode };
        if (remaining !== undefined) body.limit = remaining;

        const res = await fetch("/api/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = (await res.json()) as StartResponse;
        if (!res.ok) throw new Error((data as any).error || "Run failed");

        if (firstTotalPendingBefore === null) firstTotalPendingBefore = data.totalPendingBefore;
        lastResponse = data;

        if (!data.processed || data.processed <= 0) break;

        totalProcessed += data.processed;
        totalSame += data.metrics.count_same;
        totalDiff += data.metrics.count_diff;
        totalUnsure += data.metrics.count_unsure;
        totalDurationMs += data.metrics.duration_ms;

        if (data.metrics.avg_conf_same !== null && data.metrics.count_same > 0) {
          sumConfSame += data.metrics.avg_conf_same * data.metrics.count_same;
          nConfSame += data.metrics.count_same;
        }
        if (data.metrics.avg_conf_diff !== null && data.metrics.count_diff > 0) {
          sumConfDiff += data.metrics.avg_conf_diff * data.metrics.count_diff;
          nConfDiff += data.metrics.count_diff;
        }
        if (data.metrics.avg_conf_unsure !== null && data.metrics.count_unsure > 0) {
          sumConfUnsure += data.metrics.avg_conf_unsure * data.metrics.count_unsure;
          nConfUnsure += data.metrics.count_unsure;
        }

        if (remaining !== undefined) {
          remaining -= data.processed;
          if (remaining <= 0) break;
        }

        if (data.processed >= data.totalPendingBefore) break;
      }

      if (!lastResponse) return setLastRun(null);

      const aggregated: StartResponse = {
        ...lastResponse,
        totalPendingBefore: firstTotalPendingBefore ?? lastResponse.totalPendingBefore,
        processed: totalProcessed,
        metrics: {
          count_same: totalSame,
          count_diff: totalDiff,
          count_unsure: totalUnsure,
          avg_conf_same: nConfSame > 0 ? sumConfSame / nConfSame : null,
          avg_conf_diff: nConfDiff > 0 ? sumConfDiff / nConfDiff : null,
          avg_conf_unsure: nConfUnsure > 0 ? sumConfUnsure / nConfUnsure : null,
          duration_ms: totalDurationMs,
        },
      };

      setLastRun(aggregated);

      const statusRes = await fetch(
        `/api/status?sheetId=${encodeURIComponent(sheetId)}&tabName=${encodeURIComponent(tabName)}`
      );
      if (statusRes.ok) setStatus(await statusRes.json());

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

    if (!sheetId) return setError("Please enter a valid Sheet ID or link before saving");

    try {
      setSavingConfig(true);

      const modelToSave =
        modelSelectionMode === "known" ? selectedKnownModel : customModelId.trim();

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
      if (!res.ok) throw new Error((data as any).error || "Failed to save config");

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
      if (!res.ok) throw new Error(data.error || "Failed to load review queue");
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

  const costEstimate = useMemo(() => {
    const pricing = MODEL_PRICING[configModel];
    if (!pricing || !status) return null;

    const pending = Math.max(status.total - status.completed, 0);
    const rowsToRun =
      typeof limit === "number" && limit > 0 ? Math.min(limit, pending) : pending;

    if (rowsToRun <= 0) return null;

    const TOKENS_PER_ROW_ESTIMATE = 350;
    const INPUT_FRACTION = 0.7;

    const totalTokens = rowsToRun * TOKENS_PER_ROW_ESTIMATE;
    const inputTokens = totalTokens * INPUT_FRACTION;
    const outputTokens = totalTokens * (1 - INPUT_FRACTION);

    const cost =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    return `$${cost.toFixed(4)} approx for about ${rowsToRun} rows (model: ${configModel})`;
  }, [configModel, status, limit]);

  const analytics = useMemo(() => {
    const hasHistory = history.length > 0;

    let totalRows = 0;
    let totalSame = 0;
    let totalDiff = 0;
    let totalUnsure = 0;
    let totalDurationMs = 0;

    for (const r of history) {
      totalRows += r.rowsProcessed;
      totalSame += r.count_same;
      totalDiff += r.count_diff;
      totalUnsure += r.count_unsure;
      totalDurationMs += r.duration_ms;
    }

    const totalDecisions = totalSame + totalDiff + totalUnsure;

    const avgRunDurationSec = hasHistory ? totalDurationMs / history.length / 1000 : 0;
    const avgRowsPerRun = hasHistory ? totalRows / history.length : 0;
    const throughputRowsPerSec =
      totalDurationMs > 0 ? totalRows / (totalDurationMs / 1000) : 0;
    const unsureRate = totalDecisions > 0 ? totalUnsure / totalDecisions : 0;

    const verdictPieData = [
      { name: "Same", value: totalSame },
      { name: "Different", value: totalDiff },
      { name: "Unsure", value: totalUnsure },
    ];

    const VERDICT_COLORS = ["#22c55e", "#f97316", "#6b7280"];

    const runSeries = history
      .slice()
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
      .map((r, idx) => {
        const total = r.count_same + r.count_diff + r.count_unsure;
        const unsureRatePct = total > 0 ? (r.count_unsure / total) * 100 : 0;
        const durationSec = r.duration_ms > 0 ? r.duration_ms / 1000 : 0;
        const throughput = durationSec > 0 ? r.rowsProcessed / durationSec : 0;

        const tsLabel =
          r.timestamp && r.timestamp.length >= 19
            ? r.timestamp.slice(5, 19).replace("T", " ")
            : `Run ${idx + 1}`;

        return {
          index: idx + 1,
          label: tsLabel,
          rows: r.rowsProcessed,
          throughput,
          unsureRate: unsureRatePct,
          tab: r.tabName,
        };
      });

    return {
      hasHistory,
      totalRows,
      avgRowsPerRun,
      throughputRowsPerSec,
      avgRunDurationSec,
      unsureRate,
      verdictPieData,
      VERDICT_COLORS,
      runSeries,
    };
  }, [history]);

  return (
    <main className="fs-shell">
      <div className="fs-header">
        <div>
          <h1 className="fs-title">FoodStyles LLM Match</h1>
          <p className="fs-lede">
            Paste a Google Sheet link, pick a dataset tab, and run evaluations.
            Use Testing to measure accuracy and Production for bulk runs.
          </p>
        </div>

        <div className="fs-headerActions">
          <div className="fs-seg" aria-label="Mode">
            <button
              type="button"
              data-active={mode === "prod"}
              onClick={() => setMode("prod")}
            >
              Production
            </button>
            <button
              type="button"
              data-active={mode === "test"}
              onClick={() => setMode("test")}
            >
              Testing
            </button>
          </div>

          <button
            type="button"
            className="fs-btn fs-btn-ghost"
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      </div>

      {error && (
        <div className="fs-alert fs-alertError" style={{ whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}

      {/* Settings */}
      <section className="fs-card" style={{ marginBottom: 16 }}>
        <div className="fs-cardHead">
          <h2 className="fs-cardTitle">Settings</h2>

          <div className="fs-seg" aria-label="Settings tab">
            <button
              type="button"
              data-active={settingsTab === "core"}
              onClick={() => setSettingsTab("core")}
            >
              Core
            </button>
            <button
              type="button"
              data-active={settingsTab === "advanced"}
              onClick={() => setSettingsTab("advanced")}
            >
              Advanced
            </button>
          </div>
        </div>

        <div className="fs-cardBody">
          <div className="fs-subtle" style={{ marginBottom: 12 }}>
            Saved to the sheet Config tab.
          </div>

          {loadingConfig ? (
            <div className="fs-subtle">Loading config...</div>
          ) : (
            <form onSubmit={handleSaveConfig}>
              {settingsTab === "core" ? (
                <>
                  <div className="fs-field">
                    <div className="fs-label">Model</div>

                    <div className="fs-seg" aria-label="Model picker">
                      <button
                        type="button"
                        data-active={modelSelectionMode === "known"}
                        onClick={() => setModelSelectionMode("known")}
                      >
                        Known
                      </button>
                      <button
                        type="button"
                        data-active={modelSelectionMode === "custom"}
                        onClick={() => setModelSelectionMode("custom")}
                      >
                        Custom
                      </button>
                    </div>

                    {modelSelectionMode === "known" ? (
                      <select
                        className="fs-select"
                        value={selectedKnownModel}
                        onChange={(e) => setSelectedKnownModel(e.target.value)}
                      >
                        {KNOWN_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="fs-input"
                        type="text"
                        value={customModelId}
                        onChange={(e) => setCustomModelId(e.target.value)}
                        placeholder="Custom model ID"
                      />
                    )}

                    <div className="fs-subtle">
                      Writes to Config key <span className="fs-mono">MODEL</span>.
                    </div>
                  </div>

                  <div className="fs-field">
                    <div className="fs-label">Prompt template</div>
                    <textarea
                      className="fs-textarea fs-mono"
                      value={configPrompt}
                      onChange={(e) => setConfigPrompt(e.target.value)}
                      rows={8}
                    />
                    <div className="fs-subtle">
                      Writes to Config key <span className="fs-mono">PROMPT_TEMPLATE</span>.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="fs-row2">
                    <div className="fs-field">
                      <div className="fs-label">Temperature</div>
                      <input
                        className="fs-input"
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={configTemperature}
                        onChange={(e) =>
                          setConfigTemperature(
                            Math.max(0, Math.min(1, Number(e.target.value) || 0))
                          )
                        }
                      />
                      <div className="fs-subtle">
                        Currently not used (runs are deterministic).
                      </div>
                    </div>

                    <div className="fs-field">
                      <div className="fs-label">Max output tokens</div>
                      <input
                        className="fs-input"
                        type="number"
                        min={32}
                        max={1024}
                        value={configMaxOutputTokens}
                        onChange={(e) =>
                          setConfigMaxOutputTokens(Math.max(32, Number(e.target.value) || 32))
                        }
                      />
                      <div className="fs-subtle">Future guardrail for long outputs.</div>
                    </div>

                    <div className="fs-field">
                      <div className="fs-label">Tokens per row estimate</div>
                      <input
                        className="fs-input"
                        type="number"
                        min={32}
                        max={1024}
                        value={configMaxTokensPerItem}
                        onChange={(e) =>
                          setConfigMaxTokensPerItem(Math.max(32, Number(e.target.value) || 32))
                        }
                      />
                      <div className="fs-subtle">Used only for cost planning.</div>
                    </div>

                    <div className="fs-field">
                      <div className="fs-label">Batch size per request</div>
                      <input
                        className="fs-input"
                        type="number"
                        min={10}
                        max={200}
                        value={configBatchSize}
                        onChange={(e) =>
                          setConfigBatchSize(Math.max(10, Number(e.target.value) || 10))
                        }
                      />
                      <div className="fs-subtle">
                        Keep runs inside Vercel time limits.
                      </div>
                    </div>

                    <div className="fs-field">
                      <div className="fs-label">Max retries</div>
                      <input
                        className="fs-input"
                        type="number"
                        min={0}
                        max={3}
                        value={configMaxRetries}
                        onChange={(e) =>
                          setConfigMaxRetries(
                            Math.max(0, Math.min(3, Number(e.target.value) || 0))
                          )
                        }
                      />
                      <div className="fs-subtle">Used for 429, 5xx, or empty responses.</div>
                    </div>

                    <div className="fs-field">
                      <div className="fs-label">Rate limit delay (ms)</div>
                      <input
                        className="fs-input"
                        type="number"
                        min={0}
                        max={5000}
                        value={configRateLimitDelayMs}
                        onChange={(e) =>
                          setConfigRateLimitDelayMs(Math.max(0, Number(e.target.value) || 0))
                        }
                      />
                      <div className="fs-subtle">Base delay when backing off.</div>
                    </div>
                  </div>

                  <div className="fs-field" style={{ marginTop: 6 }}>
                    <div className="fs-label">Enable batching</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={configEnableBatching}
                        onChange={(e) => setConfigEnableBatching(e.target.checked)}
                      />
                      <span className="fs-subtle">
                        Reserved for future batch runs.
                      </span>
                    </label>
                  </div>
                </>
              )}

              <button
                type="submit"
                className="fs-btn fs-btn-primary"
                disabled={savingConfig}
              >
                {savingConfig ? "Saving..." : "Save settings"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Run controls + status */}
      <div className="fs-grid2" style={{ marginBottom: 16 }}>
        <section className="fs-card">
          <div className="fs-cardHead">
            <h2 className="fs-cardTitle">Run controls</h2>
            <div className="fs-subtle">{modeLabel}</div>
          </div>

          <div className="fs-cardBody">
            <form onSubmit={handleRun}>
              <div className="fs-field">
                <div className="fs-label">Sheet link or ID</div>
                <input
                  className="fs-input"
                  type="text"
                  value={sheetIdInput}
                  onChange={(e) => setSheetIdInput(e.target.value)}
                  placeholder="Paste a Google Sheets link or the sheet ID"
                />
                <div className="fs-subtle">
                  You can paste the full link. The app will extract the ID automatically.
                </div>
              </div>

              <div className="fs-field">
                <div className="fs-label">Dataset tab</div>
                {!sheetId ? (
                  <div className="fs-subtle">Enter a sheet link first to load tabs.</div>
                ) : loadingTabs ? (
                  <div className="fs-subtle">Loading tabs...</div>
                ) : (
                  <select
                    className="fs-select"
                    value={tabName}
                    onChange={(e) => setTabName(e.target.value)}
                  >
                    {tabs.length === 0 && <option value="">No dataset tabs found</option>}
                    {tabs.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="fs-row2">
                <div className="fs-field">
                  <div className="fs-label">Parallelism</div>
                  <input
                    className="fs-input"
                    type="number"
                    min={1}
                    max={20}
                    value={parallel}
                    onChange={(e) =>
                      setParallel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                    }
                  />
                  <div className="fs-subtle">Concurrent OpenAI calls (1 to 20).</div>
                </div>

                <div className="fs-field">
                  <div className="fs-label">Limit (optional)</div>
                  <input
                    className="fs-input"
                    type="number"
                    min={1}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="All pending"
                  />
                  <div className="fs-subtle">
                    Maximum rows to process in this run. Leave blank for all pending.
                  </div>
                </div>
              </div>

              <div className="fs-subtle" style={{ marginBottom: 12 }}>
                {costEstimate ? (
                  <>Estimated cost: <span className="fs-mono">{costEstimate}</span></>
                ) : (
                  <>Estimated cost: n/a (no pricing for model {configModel || "unknown"}).</>
                )}
              </div>

              <button
                type="submit"
                className="fs-btn fs-btn-primary"
                disabled={!tabName || running || !sheetId}
              >
                {running ? "Running..." : "Run evaluation"}
              </button>
            </form>
          </div>
        </section>

        <section className="fs-card">
          <div className="fs-cardHead">
            <h2 className="fs-cardTitle">Status</h2>
          </div>
          <div className="fs-cardBody">
            {status ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 13 }}>
                    Tab <strong>{status.tabName}</strong>
                  </div>
                  <div className="fs-subtle">
                    {status.completed} of {status.total} rows
                  </div>
                </div>

                <div style={{ marginTop: 10, marginBottom: 8 }}>
                  <div className="fs-progress">
                    <div className="fs-progressFill" style={{ width: `${completionPercent}%` }} />
                  </div>
                </div>

                <div className="fs-subtle">{completionPercent}% complete</div>
              </>
            ) : (
              <div className="fs-subtle">
                No status yet. Run a job to see progress.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Last run */}
      <section className="fs-card" style={{ marginBottom: 16 }}>
        <div className="fs-cardHead">
          <h2 className="fs-cardTitle">Last run</h2>
          <div className="fs-subtle">This browser session</div>
        </div>

        <div className="fs-cardBody">
          {lastRun ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Mode <strong>{lastRun.mode === "prod" ? "Production" : "Testing"}</strong>. Processed{" "}
                <strong>{lastRun.processed}</strong> of{" "}
                <strong>{lastRun.totalPendingBefore}</strong> pending rows on{" "}
                <strong>{lastRun.tabName}</strong>. Parallelism{" "}
                <strong>{lastRun.parallelism}</strong>.
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, marginBottom: 10 }}>
                <div>Same <strong>{lastRun.metrics.count_same}</strong></div>
                <div>Different <strong>{lastRun.metrics.count_diff}</strong></div>
                <div>Unsure <strong>{lastRun.metrics.count_unsure}</strong></div>
                <div>
                  Duration{" "}
                  <strong>{(lastRun.metrics.duration_ms / 1000).toFixed(1)}s</strong>
                </div>
              </div>

              {lastRun.mode === "test" && lastRun.testingMetrics && (
                <div style={{ marginBottom: 10 }}>
                  <div className="fs-subtle" style={{ marginBottom: 6 }}>
                    Testing metrics (LLM vs confirmed)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
                    <div>Correct <strong>{lastRun.testingMetrics.correct}</strong></div>
                    <div>Wrong <strong>{lastRun.testingMetrics.wrong}</strong></div>
                    <div>Unsure <strong>{lastRun.testingMetrics.unsure}</strong></div>
                    <div>Labelled <strong>{lastRun.testingMetrics.totalLabelled}</strong></div>
                    <div>
                      Strict accuracy{" "}
                      <strong>
                        {lastRun.testingMetrics.strict_accuracy !== null
                          ? `${(lastRun.testingMetrics.strict_accuracy * 100).toFixed(1)}%`
                          : "n/a"}
                      </strong>
                    </div>
                    <div>
                      Coverage{" "}
                      <strong>
                        {lastRun.testingMetrics.coverage !== null
                          ? `${(lastRun.testingMetrics.coverage * 100).toFixed(1)}%`
                          : "n/a"}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="fs-subtle">Sample updates</div>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {lastRun.sampleUpdates.map((u) => (
                  <li key={u.rowIndex} style={{ marginBottom: 6, fontSize: 13 }}>
                    Row {u.rowIndex}: <strong>{u.verdict}</strong> (score {u.match_score})
                    {u.notes ? ` - ${u.notes}` : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="fs-subtle">No runs yet in this session.</div>
          )}
        </div>
      </section>

      {/* Analytics */}
      <section className="fs-card" style={{ marginBottom: 16 }}>
        <div className="fs-cardHead">
          <h2 className="fs-cardTitle">Analytics</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="fs-subtle">{modeLabel}</div>
            <div className="fs-seg" aria-label="Analytics tab">
              <button
                type="button"
                data-active={analyticsTab === "overview"}
                onClick={() => setAnalyticsTab("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                data-active={analyticsTab === "advanced"}
                onClick={() => setAnalyticsTab("advanced")}
              >
                Advanced
              </button>
            </div>
          </div>
        </div>

        <div className="fs-cardBody">
          {!analytics.hasHistory ? (
            <div className="fs-subtle">
              No history yet. After a few runs, this will summarize throughput and outcomes.
            </div>
          ) : analyticsTab === "overview" ? (
            <>
              <div className="fs-kpiGrid">
                <div className="fs-kpi">
                  <div className="fs-kpiLabel">Total rows processed</div>
                  <div className="fs-kpiValue">{analytics.totalRows}</div>
                </div>

                <div className="fs-kpi">
                  <div className="fs-kpiLabel">Average rows per run</div>
                  <div className="fs-kpiValue">{analytics.avgRowsPerRun.toFixed(1)}</div>
                </div>

                <div className="fs-kpi">
                  <div className="fs-kpiLabel">Throughput (rows per sec)</div>
                  <div className="fs-kpiValue">{analytics.throughputRowsPerSec.toFixed(2)}</div>
                </div>

                <div className="fs-kpi">
                  <div className="fs-kpiLabel">Average run duration (sec)</div>
                  <div className="fs-kpiValue">{analytics.avgRunDurationSec.toFixed(1)}</div>
                </div>

                <div className="fs-kpi">
                  <div className="fs-kpiLabel">Unsure rate</div>
                  <div className="fs-kpiValue">{(analytics.unsureRate * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div className="fs-row2">
                <div className="fs-kpi" style={{ minHeight: 290 }}>
                  <div className="fs-kpiLabel">Verdict distribution</div>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={analytics.verdictPieData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={85}
                          label={({ name, percent }) => {
                            const pct = percent ?? 0;
                            return `${name} ${(pct * 100).toFixed(0)}%`;
                          }}
                        >
                          {analytics.verdictPieData.map((_, index) => (
                            <Cell
                              key={index}
                              fill={analytics.VERDICT_COLORS[index % analytics.VERDICT_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="fs-kpi" style={{ minHeight: 290 }}>
                  <div className="fs-kpiLabel">Rows and throughput per run</div>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <BarChart data={analytics.runSeries}>
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
                        <Bar yAxisId="left" dataKey="rows" name="Rows" fill="#f97316" />
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
            <div className="fs-row2">
              <div className="fs-kpi" style={{ minHeight: 320 }}>
                <div className="fs-kpiLabel">Throughput vs unsure percentage</div>
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="throughput"
                        name="Rows/sec"
                        tickFormatter={(v) => v.toFixed(1)}
                      />
                      <YAxis type="number" dataKey="unsureRate" name="Unsure percentage" />
                      <ZAxis type="number" dataKey="rows" range={[60, 400]} name="Rows" />
                      <Tooltip
                        formatter={(value: any, name: any) => {
                          if (name === "unsureRate") return [`${(value as number).toFixed(1)}%`, name];
                          if (name === "throughput") return [`${(value as number).toFixed(2)}`, name];
                          return [value, name];
                        }}
                        labelFormatter={(_, payload) => {
                          if (!payload || payload.length === 0) return "";
                          const p = payload[0].payload as any;
                          return p.label || `Run ${p.index}`;
                        }}
                      />
                      <Scatter name="Run" data={analytics.runSeries} fill="#f97316" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="fs-kpi" style={{ minHeight: 320 }}>
                <div className="fs-kpiLabel">Per run details</div>
                <div className="fs-tableWrap" style={{ maxHeight: 280, marginTop: 8 }}>
                  <table className="fs-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Rows</th>
                        <th style={{ textAlign: "right" }}>Rows/sec</th>
                        <th style={{ textAlign: "right" }}>Unsure</th>
                        <th>Tab</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.runSeries
                        .slice()
                        .reverse()
                        .map((r) => (
                          <tr key={r.index}>
                            <td>{r.index}</td>
                            <td>{r.rows}</td>
                            <td style={{ textAlign: "right" }}>{r.throughput.toFixed(2)}</td>
                            <td style={{ textAlign: "right" }}>{r.unsureRate.toFixed(1)}%</td>
                            <td>{r.tab}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Run log */}
      <section className="fs-card" style={{ marginBottom: 16 }}>
        <div className="fs-cardHead">
          <h2 className="fs-cardTitle">Run log</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="fs-subtle">{modeLabel}</div>
            <div className="fs-seg" aria-label="History grouping">
              <button
                type="button"
                data-active={historyGroup === "logical"}
                onClick={() => setHistoryGroup("logical")}
              >
                Grouped
              </button>
              <button
                type="button"
                data-active={historyGroup === "chunks"}
                onClick={() => setHistoryGroup("chunks")}
              >
                Chunks
              </button>
            </div>
          </div>
        </div>

        <div className="fs-cardBody">
          {loadingHistory ? (
            <div className="fs-subtle">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="fs-subtle">No runs logged yet for this mode.</div>
          ) : (
            <div className="fs-tableWrap">
              <table className="fs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Tab</th>
                    <th>Model</th>
                    {historyGroup === "logical" && <th style={{ textAlign: "right" }}>Chunks</th>}
                    <th style={{ textAlign: "right" }}>Rows</th>
                    <th style={{ textAlign: "right" }}>Same / Diff / Unsure</th>
                    <th style={{ textAlign: "right" }}>Sec</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .slice()
                    .reverse()
                    .map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.timestamp}</td>
                        <td>{r.tabName}</td>
                        <td>{r.model}</td>
                        {historyGroup === "logical" && (
                          <td style={{ textAlign: "right" }}>{r.chunks ?? 1}</td>
                        )}
                        <td style={{ textAlign: "right" }}>{r.rowsProcessed}</td>
                        <td style={{ textAlign: "right" }}>
                          {r.count_same} / {r.count_diff} / {r.count_unsure}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {(r.duration_ms / 1000).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Review queue */}
      <section className="fs-card" style={{ marginBottom: 16 }}>
        <div className="fs-cardHead">
          <h2 className="fs-cardTitle">Review queue</h2>
          <div className="fs-subtle">Unsure and low confidence</div>
        </div>

        <div className="fs-cardBody">
          <button
            type="button"
            className="fs-btn fs-btn-primary"
            onClick={loadReviewQueue}
            disabled={loadingReview || !tabName || !sheetId}
          >
            {loadingReview ? "Loading..." : "Load review items"}
          </button>

          {reviewError && (
            <div className="fs-alert fs-alertError" style={{ marginTop: 12 }}>
              {reviewError}
            </div>
          )}

          {reviewItems.length === 0 ? (
            <div className="fs-subtle" style={{ marginTop: 12 }}>
              No review items loaded. Click Load review items to fetch rows that need attention.
            </div>
          ) : (
            <div className="fs-tableWrap" style={{ marginTop: 12 }}>
              <table className="fs-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name 1</th>
                    <th>Name 2</th>
                    <th>Verdict</th>
                    <th style={{ textAlign: "right" }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewItems.slice(0, 25).map((item) => (
                    <tr key={item.rowIndex}>
                      <td>{item.rowIndex}</td>
                      <td>{item.name1}</td>
                      <td>{item.name2}</td>
                      <td>{item.verdict}</td>
                      <td style={{ textAlign: "right" }}>
                        {item.confidence !== null ? item.confidence.toFixed(2) : "n/a"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="fs-subtle" style={{ marginTop: 10 }}>
            The queue includes all Unsure rows plus Same or Different decisions with confidence 0.75 or lower.
            Edits happen directly in the sheet.
          </div>
        </div>
      </section>
    </main>
  );
}
