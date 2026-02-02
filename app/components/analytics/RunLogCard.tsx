import type { HistoryGroup, RunHistoryRow } from "../types";

type Props = {
  modeLabel: string;
  history: RunHistoryRow[];
  loadingHistory: boolean;
  historyGroup: HistoryGroup;
  setHistoryGroup: (g: HistoryGroup) => void;
};

export default function RunLogCard(props: Props) {
  return (
    <section className="fs-card" style={{ marginBottom: 16 }}>
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Run log</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="fs-subtle">{props.modeLabel}</div>
          <div className="fs-seg" aria-label="History grouping">
            <button
              type="button"
              data-active={props.historyGroup === "logical"}
              onClick={() => props.setHistoryGroup("logical")}
            >
              Grouped
            </button>
            <button
              type="button"
              data-active={props.historyGroup === "chunks"}
              onClick={() => props.setHistoryGroup("chunks")}
            >
              Chunks
            </button>
          </div>
        </div>
      </div>

      <div className="fs-cardBody">
        {props.loadingHistory ? (
          <div className="fs-subtle">Loading history...</div>
        ) : props.history.length === 0 ? (
          <div className="fs-subtle">No runs logged yet for this mode.</div>
        ) : (
          <div className="fs-tableWrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Tab</th>
                  <th>Model</th>
                  {props.historyGroup === "logical" && <th style={{ textAlign: "right" }}>Chunks</th>}
                  <th style={{ textAlign: "right" }}>Rows</th>
                  <th style={{ textAlign: "right" }}>Same / Diff / Unsure</th>
                  <th style={{ textAlign: "right" }}>Sec</th>
                </tr>
              </thead>
              <tbody>
                {props.history
                  .slice()
                  .reverse()
                  .map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.timestamp}</td>
                      <td>{r.tabName}</td>
                      <td>{r.model}</td>
                      {props.historyGroup === "logical" && (
                        <td style={{ textAlign: "right" }}>{r.chunks ?? 1}</td>
                      )}
                      <td style={{ textAlign: "right" }}>{r.rowsProcessed}</td>
                      <td style={{ textAlign: "right" }}>
                        {r.count_same} / {r.count_diff} / {r.count_unsure}
                      </td>
                      <td style={{ textAlign: "right" }}>{(r.duration_ms / 1000).toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
