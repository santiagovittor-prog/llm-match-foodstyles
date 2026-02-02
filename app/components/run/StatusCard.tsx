import type { StatusResponse } from "@/components/types";

type Props = {
  status: StatusResponse | null;
  completionPercent: number;
};

export default function StatusCard(props: Props) {
  return (
    <section className="fs-card">
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Status</h2>
      </div>

      <div className="fs-cardBody">
        {props.status ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                Tab <strong>{props.status.tabName}</strong>
              </div>
              <div className="fs-subtle">
                {props.status.completed} of {props.status.total} rows
              </div>
            </div>

            <div style={{ marginTop: 10, marginBottom: 8 }}>
              <div className="fs-progress">
                <div className="fs-progressFill" style={{ width: `${props.completionPercent}%` }} />
              </div>
            </div>

            <div className="fs-subtle">{props.completionPercent}% complete</div>
          </>
        ) : (
          <div className="fs-subtle">No status yet. Run a job to see progress.</div>
        )}
      </div>
    </section>
  );
}
