import { useEffect, useRef } from 'react';
import type { SizeChartView } from '@shop/shared';

interface SizeGuideDialogProps {
  chart: SizeChartView;
  onClose: () => void;
}

/**
 * Native `<dialog>` rather than a hand-rolled overlay.
 *
 * `showModal()` gives focus trapping, Escape-to-close, an inert background and
 * the top layer for free — four things a div-based modal gets wrong often enough
 * that they are the classic accessibility bug in a storefront.
 *
 * The columns come from the chart, not from a fixed list: a dress needs
 * bust/waist/hip/length while a trouser needs waist/inseam, and hard-coding four
 * columns forces every trouser to report a chest measurement.
 */
export const SizeGuideDialog = ({ chart, onClose }: SizeGuideDialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  return (
    <dialog className="dialog" ref={ref} onClose={onClose}>
      <header className="dialog-head">
        <h2>{chart.name}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => ref.current?.close()}
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <p className="muted dialog-note">
        Garment measurements in {chart.unit === 'cm' ? 'centimetres' : 'inches'}.
      </p>

      <div className="table-scroll">
        <table className="size-table">
          <thead>
            <tr>
              <th scope="col">Size</th>
              {chart.columns.map((column) => (
                <th key={column.code} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row.size}>
                <th scope="row">{row.size.toUpperCase()}</th>
                {chart.columns.map((column) => (
                  // A dash rather than a blank: an empty cell reads as a rendering
                  // fault, a dash reads as "not measured for this garment".
                  <td key={column.code}>{row.values[column.code] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chart.note ? <p className="muted dialog-note">{chart.note}</p> : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => ref.current?.close()}
      >
        Close
      </button>
    </dialog>
  );
};
