type Props = {
  modeLabel: string;

  sheetIdInput: string;
  setSheetIdInput: (v: string) => void;
  sheetIdNormalized: string;

  loadingTabs: boolean;
  tabs: string[];
  tabName: string;
  setTabName: (v: string) => void;

  parallel: number;
  setParallel: (v: number) => void;

  limit: number | "";
  setLimit: (v: number | "") => void;

  running: boolean;
  costEstimate: string | null;

  onRun: (e: React.FormEvent) => void;
};

export default function RunControlsCard(props: Props) {
  return (
    <section className="fs-card">
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Run controls</h2>
        <div className="fs-subtle">{props.modeLabel}</div>
      </div>

      <div className="fs-cardBody">
        <form onSubmit={props.onRun}>
          <div className="fs-field">
            <div className="fs-label">Sheet link or ID</div>
            <input
              className="fs-input"
              type="text"
              value={props.sheetIdInput}
              onChange={(e) => props.setSheetIdInput(e.target.value)}
              placeholder="Paste a Google Sheets link or the sheet ID"
            />
            <div className="fs-subtle">
              You can paste the full link. The app will extract the ID automatically.
            </div>
          </div>

          <div className="fs-field">
            <div className="fs-label">Dataset tab</div>
            {!props.sheetIdNormalized ? (
              <div className="fs-subtle">Enter a sheet link first to load tabs.</div>
            ) : props.loadingTabs ? (
              <div className="fs-subtle">Loading tabs...</div>
            ) : (
              <select
                className="fs-select"
                value={props.tabName}
                onChange={(e) => props.setTabName(e.target.value)}
              >
                {props.tabs.length === 0 && <option value="">No dataset tabs found</option>}
                {props.tabs.map((t) => (
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
                value={props.parallel}
                onChange={(e) =>
                  props.setParallel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
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
                value={props.limit}
                onChange={(e) =>
                  props.setLimit(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="All pending"
              />
              <div className="fs-subtle">
                Maximum rows to process in this run. Leave blank for all pending.
              </div>
            </div>
          </div>

          <div className="fs-subtle" style={{ marginBottom: 12 }}>
            {props.costEstimate ? (
              <>
                Estimated cost: <span className="fs-mono">{props.costEstimate}</span>
              </>
            ) : (
              <>Estimated cost: n/a.</>
            )}
          </div>

          <button
            type="submit"
            className="fs-btn fs-btn-primary"
            disabled={!props.tabName || props.running || !props.sheetIdNormalized}
          >
            {props.running ? "Running..." : "Run evaluation"}
          </button>
        </form>
      </div>
    </section>
  );
}
