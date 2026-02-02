"use client";

import { useEffect, useMemo, useState } from "react";
import { KNOWN_MODELS, MODEL_PRICING, type KnownModel } from "./constants";
import type {
  AnalyticsComputed,
  AnalyticsTab,
  ConfigResponse,
  HistoryGroup,
  Mode,
  ModelSelectionMode,
  ReviewItem,
  RunHistoryRow,
  SettingsTab,
  StartResponse,
  StatusResponse,
} from "./types";

import SettingsCard from "./settings/SettingsCard";
import RunControlsCard from "./run/RunControlsCard";
import StatusCard from "./run/StatusCard";
import LastRunCard from "./run/LastRunCard";
import AnalyticsCard from "./analytics/AnalyticsCard";
import RunLogCard from "./analytics/RunLogCard";
import ReviewQueueCard from "./review/ReviewQueueCard";

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

const DEFAULT_SHEET_ID =
  process.env.NEXT_PUBLIC_DEFAULT_SHEET_ID ??
  "1TtCndQtYZSCMzTzDvLqBlb3YiBRQPF0xq3xI7KKNcKg";

export default function App() {
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
  const [configMaxOutputTokens, setConfigMaxOutputTokens] = useState<number>(256);
  const [configMaxTokensPerItem, setConfigMaxTokensPerItem] = useState<number>(64);
  const [configBatchSize, setConfigBatchSize] = useState<number>(50);
  const [configMaxRetries, setConfigMaxRetries] = useState<number>(1);
  const [configRateLimitDelayMs, setConfigRateLimitDelayMs] = useState<number>(250);
  const [configEnableBatching, setConfigEnableBatching] = useState<boolean>(false);

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
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("overview");

  const [historyGroup, setHistoryGroup] = useState<HistoryGroup>("logical");

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Sync dropdown/custom with configModel from server
  useEffect(() => {
    if (!configModel) return;
    const found = KNOWN_MODELS.find((m: KnownModel) => m.id === configModel);
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

        const cfgData = (await configRes.json()) as ConfigResponse | { error?: string };
        if (!configRes.ok) throw new Error((cfgData as any).error || "Failed to load config");

        const cfg = cfgData as ConfigResponse;
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

      const data = (await res.json()) as ConfigResponse | { error?: string };
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

  const analytics: AnalyticsComputed = useMemo(() => {
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

    const verdictColors = ["#22c55e", "#f97316", "#6b7280"];

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
      verdictColors,
      runSeries,
    };
  }, [history]);

  return (
    <main className="fs-shell">
      <div className="fs-header">
        <div>
          <h1 className="fs-title">FoodStyles LLM Match</h1>
          <p className="fs-lede">
            Paste a Google Sheet link, pick a dataset tab, and run evaluations. Use
            Testing to measure accuracy and Production for bulk runs.
          </p>
        </div>

        <div className="fs-headerActions">
          <div className="fs-seg" aria-label="Mode">
            <button type="button" data-active={mode === "prod"} onClick={() => setMode("prod")}>
              Production
            </button>
            <button type="button" data-active={mode === "test"} onClick={() => setMode("test")}>
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

      <SettingsCard
        loadingConfig={loadingConfig}
        savingConfig={savingConfig}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        knownModels={KNOWN_MODELS}
        modelSelectionMode={modelSelectionMode}
        setModelSelectionMode={setModelSelectionMode}
        selectedKnownModel={selectedKnownModel}
        setSelectedKnownModel={setSelectedKnownModel}
        customModelId={customModelId}
        setCustomModelId={setCustomModelId}
        configModel={configModel}
        configPrompt={configPrompt}
        setConfigPrompt={setConfigPrompt}
        configTemperature={configTemperature}
        setConfigTemperature={setConfigTemperature}
        configMaxOutputTokens={configMaxOutputTokens}
        setConfigMaxOutputTokens={setConfigMaxOutputTokens}
        configMaxTokensPerItem={configMaxTokensPerItem}
        setConfigMaxTokensPerItem={setConfigMaxTokensPerItem}
        configBatchSize={configBatchSize}
        setConfigBatchSize={setConfigBatchSize}
        configMaxRetries={configMaxRetries}
        setConfigMaxRetries={setConfigMaxRetries}
        configRateLimitDelayMs={configRateLimitDelayMs}
        setConfigRateLimitDelayMs={setConfigRateLimitDelayMs}
        configEnableBatching={configEnableBatching}
        setConfigEnableBatching={setConfigEnableBatching}
        onSave={handleSaveConfig}
      />

      <div className="fs-grid2" style={{ marginBottom: 16 }}>
        <RunControlsCard
          modeLabel={modeLabel}
          sheetIdInput={sheetIdInput}
          setSheetIdInput={setSheetIdInput}
          sheetIdNormalized={sheetId}
          loadingTabs={loadingTabs}
          tabs={tabs}
          tabName={tabName}
          setTabName={setTabName}
          parallel={parallel}
          setParallel={setParallel}
          limit={limit}
          setLimit={setLimit}
          running={running}
          costEstimate={costEstimate}
          onRun={handleRun}
        />

        <StatusCard status={status} completionPercent={completionPercent} />
      </div>

      <LastRunCard lastRun={lastRun} />

      <AnalyticsCard
        analytics={analytics}
        modeLabel={modeLabel}
        analyticsTab={analyticsTab}
        setAnalyticsTab={setAnalyticsTab}
      />

      <RunLogCard
        modeLabel={modeLabel}
        history={history}
        loadingHistory={loadingHistory}
        historyGroup={historyGroup}
        setHistoryGroup={setHistoryGroup}
      />

      <ReviewQueueCard
        sheetIdNormalized={sheetId}
        tabName={tabName}
        reviewItems={reviewItems}
        loadingReview={loadingReview}
        reviewError={reviewError}
        onLoad={loadReviewQueue}
      />
    </main>
  );
}
