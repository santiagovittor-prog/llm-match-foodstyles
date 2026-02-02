import type { AnalyticsComputed, AnalyticsTab } from "@/components/types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  Bar,
  Line,
} from "recharts";

type Props = {
  analytics: AnalyticsComputed;
  modeLabel: string;
  analyticsTab: AnalyticsTab;
  setAnalyticsTab: (t: AnalyticsTab) => void;
};

export default function AnalyticsCard(props: Props) {
  return (
    <section className="fs-card" style={{ marginBottom: 16 }}>
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Analytics</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="fs-subtle">{props.modeLabel}</div>
          <div className="fs-seg" aria-label="Analytics tab">
            <button
              type="button"
              data-active={props.analyticsTab === "overview"}
              onClick={() => props.setAnalyticsTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              data-active={props.analyticsTab === "advanced"}
              onClick={() => props.setAnalyticsTab("advanced")}
            >
              Advanced
            </button>
          </div>
        </div>
      </div>

      <div className="fs-cardBody">
        {!props.analytics.hasHistory ? (
          <div className="fs-subtle">
            No history yet. After a few runs, this will summarize throughput and outcomes.
          </div>
        ) : props.analyticsTab === "overview" ? (
          <>
            <div className="fs-kpiGrid">
              <div className="fs-kpi">
                <div className="fs-kpiLabel">Total rows processed</div>
                <div className="fs-kpiValue">{props.analytics.totalRows}</div>
              </div>

              <div className="fs-kpi">
                <div className="fs-kpiLabel">Average rows per run</div>
                <div className="fs-kpiValue">{props.analytics.avgRowsPerRun.toFixed(1)}</div>
              </div>

              <div className="fs-kpi">
                <div className="fs-kpiLabel">Throughput (rows per sec)</div>
                <div className="fs-kpiValue">{props.analytics.throughputRowsPerSec.toFixed(2)}</div>
              </div>

              <div className="fs-kpi">
                <div className="fs-kpiLabel">Average run duration (sec)</div>
                <div className="fs-kpiValue">{props.analytics.avgRunDurationSec.toFixed(1)}</div>
              </div>

              <div className="fs-kpi">
                <div className="fs-kpiLabel">Unsure rate</div>
                <div className="fs-kpiValue">{(props.analytics.unsureRate * 100).toFixed(1)}%</div>
              </div>
            </div>

            <div className="fs-row2">
              <div className="fs-kpi" style={{ minHeight: 290 }}>
                <div className="fs-kpiLabel">Verdict distribution</div>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={props.analytics.verdictPieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={85}
                        label={({ name, percent }) => {
                          const pct = percent ?? 0;
                          return `${name} ${(pct * 100).toFixed(0)}%`;
                        }}
                      >
                        {props.analytics.verdictPieData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={props.analytics.verdictColors[index % props.analytics.verdictColors.length]}
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
                    <ComposedChart data={props.analytics.runSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="index" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => Number(v).toFixed(1)} />
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
                    </ComposedChart>
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
                      tickFormatter={(v) => Number(v).toFixed(1)}
                    />
                    <YAxis type="number" dataKey="unsureRate" name="Unsure percentage" />
                    <ZAxis type="number" dataKey="rows" range={[60, 400]} name="Rows" />
                    <Tooltip
                      formatter={(value: any, name: any) => {
                        if (name === "unsureRate") return [`${Number(value).toFixed(1)}%`, name];
                        if (name === "throughput") return [`${Number(value).toFixed(2)}`, name];
                        return [value, name];
                      }}
                      labelFormatter={(_, payload) => {
                        if (!payload || payload.length === 0) return "";
                        const p = payload[0].payload as any;
                        return p.label || `Run ${p.index}`;
                      }}
                    />
                    <Scatter name="Run" data={props.analytics.runSeries} fill="#f97316" />
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
                    {props.analytics.runSeries
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
  );
}
