import type { StartResponse } from "@/components/types";

type Props = {
  lastRun: StartResponse | null;
};

export default function LastRunCard(props: Props) {
  return (
    <section className="fs-card" style={{ marginBottom: 16 }}>
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Last run</h2>
        <div className="fs-subtle">This browser session</div>
      </div>

      <div className="fs-cardBody">
        {props.lastRun ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Mode <strong>{props.lastRun.mode === "prod" ? "Production" : "Testing"}</strong>.
              Processed <strong>{props.lastRun.processed}</strong> of{" "}
              <strong>{props.lastRun.totalPendingBefore}</strong> pending rows on{" "}
              <strong>{props.lastRun.tabName}</strong>. Parallelism{" "}
              <strong>{props.lastRun.parallelism}</strong>.
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, marginBottom: 10 }}>
              <div>Same <strong>{props.lastRun.metrics.count_same}</strong></div>
              <div>Different <strong>{props.lastRun.metrics.count_diff}</strong></div>
              <div>Unsure <strong>{props.lastRun.metrics.count_unsure}</strong></div>
              <div>
                Duration <strong>{(props.lastRun.metrics.duration_ms / 1000).toFixed(1)}s</strong>
              </div>
            </div>

            {props.lastRun.mode === "test" && props.lastRun.testingMetrics && (
              <div style={{ marginBottom: 10 }}>
                <div className="fs-subtle" style={{ marginBottom: 6 }}>
                  Testing metrics (LLM vs confirmed)
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
                  <div>Correct <strong>{props.lastRun.testingMetrics.correct}</strong></div>
                  <div>Wrong <strong>{props.lastRun.testingMetrics.wrong}</strong></div>
                  <div>Unsure <strong>{props.lastRun.testingMetrics.unsure}</strong></div>
                  <div>Labelled <strong>{props.lastRun.testingMetrics.totalLabelled}</strong></div>
                  <div>
                    Strict accuracy{" "}
                    <strong>
                      {props.lastRun.testingMetrics.strict_accuracy !== null
                        ? `${(props.lastRun.testingMetrics.strict_accuracy * 100).toFixed(1)}%`
                        : "n/a"}
                    </strong>
                  </div>
                  <div>
                    Coverage{" "}
                    <strong>
                      {props.lastRun.testingMetrics.coverage !== null
                        ? `${(props.lastRun.testingMetrics.coverage * 100).toFixed(1)}%`
                        : "n/a"}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="fs-subtle">Sample updates</div>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {props.lastRun.sampleUpdates.map((u) => (
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
  );
}
