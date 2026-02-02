import type { ReviewItem } from "../types";

type Props = {
  sheetIdNormalized: string;
  tabName: string;
  reviewItems: ReviewItem[];
  loadingReview: boolean;
  reviewError: string | null;
  onLoad: () => void;
};

export default function ReviewQueueCard(props: Props) {
  return (
    <section className="fs-card" style={{ marginBottom: 16 }}>
      <div className="fs-cardHead">
        <h2 className="fs-cardTitle">Review queue</h2>
        <div className="fs-subtle">Unsure and low confidence</div>
      </div>

      <div className="fs-cardBody">
        <button
          type="button"
          className="fs-btn fs-btn-primary"
          onClick={props.onLoad}
          disabled={props.loadingReview || !props.tabName || !props.sheetIdNormalized}
        >
          {props.loadingReview ? "Loading..." : "Load review items"}
        </button>

        {props.reviewError && (
          <div className="fs-alert fs-alertError" style={{ marginTop: 12 }}>
            {props.reviewError}
          </div>
        )}

        {props.reviewItems.length === 0 ? (
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
                {props.reviewItems.slice(0, 25).map((item) => (
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
  );
}
