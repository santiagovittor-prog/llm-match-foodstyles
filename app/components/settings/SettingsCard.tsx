import type { ModelSelectionMode, SettingsTab } from "@/components/types";

type KnownModel = { id: string; label: string };

type Props = {
  loadingConfig: boolean;
  savingConfig: boolean;

  settingsTab: SettingsTab;
  setSettingsTab: (t: SettingsTab) => void;

  knownModels: KnownModel[];

  modelSelectionMode: ModelSelectionMode;
  setModelSelectionMode: (m: ModelSelectionMode) => void;

  selectedKnownModel: string;
  setSelectedKnownModel: (v: string) => void;

  customModelId: string;
  setCustomModelId: (v: string) => void;

  configModel: string;

  configPrompt: string;
  setConfigPrompt: (v: string) => void;

  configTemperature: number;
  setConfigTemperature: (v: number) => void;

  configMaxOutputTokens: number;
  setConfigMaxOutputTokens: (v: number) => void;

  configMaxTokensPerItem: number;
  setConfigMaxTokensPerItem: (v: number) => void;

  configBatchSize: number;
  setConfigBatchSize: (v: number) => void;

  configMaxRetries: number;
  setConfigMaxRetries: (v: number) => void;

  configRateLimitDelayMs: number;
  setConfigRateLimitDelayMs: (v: number) => void;

  configEnableBatching: boolean;
  setConfigEnableBatching: (v: boolean) => void;

  onSave: (e: React.FormEvent) => void;
};

export default function SettingsCard(props: Props) {
  return (
    <section className="fs-card" style={{ marginBottom: 16 }}>
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Settings</h2>

        <div className="fs-seg" aria-label="Settings tab">
          <button
            type="button"
            data-active={props.settingsTab === "core"}
            onClick={() => props.setSettingsTab("core")}
          >
            Core
          </button>
          <button
            type="button"
            data-active={props.settingsTab === "advanced"}
            onClick={() => props.setSettingsTab("advanced")}
          >
            Advanced
          </button>
        </div>
      </div>

      <div className="fs-cardBody">
        <div className="fs-subtle" style={{ marginBottom: 12 }}>
          Saved to the sheet Config tab.
        </div>

        {props.loadingConfig ? (
          <div className="fs-subtle">Loading config...</div>
        ) : (
          <form onSubmit={props.onSave}>
            {props.settingsTab === "core" ? (
              <>
                <div className="fs-field">
                  <div className="fs-label">Model</div>

                  <div className="fs-seg" aria-label="Model picker">
                    <button
                      type="button"
                      data-active={props.modelSelectionMode === "known"}
                      onClick={() => props.setModelSelectionMode("known")}
                    >
                      Known
                    </button>
                    <button
                      type="button"
                      data-active={props.modelSelectionMode === "custom"}
                      onClick={() => props.setModelSelectionMode("custom")}
                    >
                      Custom
                    </button>
                  </div>

                  {props.modelSelectionMode === "known" ? (
                    <select
                      className="fs-select"
                      value={props.selectedKnownModel}
                      onChange={(e) => props.setSelectedKnownModel(e.target.value)}
                    >
                      {props.knownModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="fs-input"
                      type="text"
                      value={props.customModelId}
                      onChange={(e) => props.setCustomModelId(e.target.value)}
                      placeholder="Custom model ID"
                    />
                  )}

                  <div className="fs-subtle">
                    Current model: <span className="fs-mono">{props.configModel || "unset"}</span>
                  </div>
                </div>

                <div className="fs-field">
                  <div className="fs-label">Prompt template</div>
                  <textarea
                    className="fs-textarea fs-mono"
                    value={props.configPrompt}
                    onChange={(e) => props.setConfigPrompt(e.target.value)}
                    rows={8}
                  />
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
                      value={props.configTemperature}
                      onChange={(e) =>
                        props.setConfigTemperature(
                          Math.max(0, Math.min(1, Number(e.target.value) || 0))
                        )
                      }
                    />
                    <div className="fs-subtle">Currently not used (runs are deterministic).</div>
                  </div>

                  <div className="fs-field">
                    <div className="fs-label">Max output tokens</div>
                    <input
                      className="fs-input"
                      type="number"
                      min={32}
                      max={1024}
                      value={props.configMaxOutputTokens}
                      onChange={(e) =>
                        props.setConfigMaxOutputTokens(Math.max(32, Number(e.target.value) || 32))
                      }
                    />
                  </div>

                  <div className="fs-field">
                    <div className="fs-label">Tokens per row estimate</div>
                    <input
                      className="fs-input"
                      type="number"
                      min={32}
                      max={1024}
                      value={props.configMaxTokensPerItem}
                      onChange={(e) =>
                        props.setConfigMaxTokensPerItem(Math.max(32, Number(e.target.value) || 32))
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
                      value={props.configBatchSize}
                      onChange={(e) =>
                        props.setConfigBatchSize(Math.max(10, Number(e.target.value) || 10))
                      }
                    />
                    <div className="fs-subtle">Keep runs inside Vercel time limits.</div>
                  </div>

                  <div className="fs-field">
                    <div className="fs-label">Max retries</div>
                    <input
                      className="fs-input"
                      type="number"
                      min={0}
                      max={3}
                      value={props.configMaxRetries}
                      onChange={(e) =>
                        props.setConfigMaxRetries(
                          Math.max(0, Math.min(3, Number(e.target.value) || 0))
                        )
                      }
                    />
                  </div>

                  <div className="fs-field">
                    <div className="fs-label">Rate limit delay (ms)</div>
                    <input
                      className="fs-input"
                      type="number"
                      min={0}
                      max={5000}
                      value={props.configRateLimitDelayMs}
                      onChange={(e) =>
                        props.setConfigRateLimitDelayMs(Math.max(0, Number(e.target.value) || 0))
                      }
                    />
                  </div>
                </div>

                <div className="fs-field" style={{ marginTop: 6 }}>
                  <div className="fs-label">Enable batching</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={props.configEnableBatching}
                      onChange={(e) => props.setConfigEnableBatching(e.target.checked)}
                    />
                    <span className="fs-subtle">Reserved for future batch runs.</span>
                  </label>
                </div>
              </>
            )}

            <button type="submit" className="fs-btn fs-btn-primary" disabled={props.savingConfig}>
              {props.savingConfig ? "Saving..." : "Save settings"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
