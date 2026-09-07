/**
 * The panel's charts, drawn by hand.
 *
 * No charting library. Three shapes are needed — an area, a column and a ring —
 * and each is a handful of geometry, against a dependency that would add far
 * more than it saves, ship its own opinions about colour and type, and have to
 * be themed back into line anyway. Everything here reads its colours from the
 * same tokens as the rest of the panel, so one theme switch moves all of it.
 */

const CHART_COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

export const chartColour = (index: number): string =>
  CHART_COLOURS[index % CHART_COLOURS.length] as string;

/* ------------------------------- spark area ------------------------------- */

/**
 * The thumbnail line inside a stat card.
 *
 * Deliberately axis-less and label-less: it answers "which way, and how
 * steadily" in the corner of a card, and anyone who wants the numbers has the
 * full chart below. Adding a scale would make it a small bad chart instead of a
 * good glyph.
 */
export const SparkArea = ({
  points,
  colour = 'var(--chart-1)',
  label,
}: {
  points: number[];
  colour?: string;
  label: string;
}) => {
  if (points.length < 2) return <div className="spark" aria-hidden="true" />;

  const W = 100;
  const H = 32;
  const max = Math.max(...points);
  const min = Math.min(...points);
  /**
   * A flat series has zero range, and dividing by it gives NaN in every `y` —
   * which SVG renders as nothing at all, so a week of identical takings drew an
   * empty box. A flat line belongs at mid-height.
   */
  const range = max - min || 1;
  const step = W / (points.length - 1);

  const coords = points.map((value, index) => {
    const x = index * step;
    const y = H - ((value - min) / range) * (H - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${coords.join(' L')}`;
  // Closed back along the baseline so the fill has something to fill.
  const area = `${line} L${W},${H} L0,${H} Z`;
  const id = `spark-${label.replace(/\W+/g, '')}`;

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} trend`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      {/*
        `vector-effect` keeps the stroke 1.5px after the non-uniform scale that
        `preserveAspectRatio="none"` applies — without it the line thins to a
        hairline at the card's real width and thickens on a narrow screen.
      */}
      <path
        d={line}
        fill="none"
        stroke={colour}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/* -------------------------------- bar chart ------------------------------- */

export interface BarPoint {
  label: string;
  value: number;
  /** Shown in the tooltip in place of the raw number — money, usually. */
  display?: string;
}

/**
 * Daily columns.
 *
 * Bars rather than a line, beside the sparkline rather than instead of it: the
 * line says which way things are going, bars say how Tuesday compared with
 * Wednesday. Daily takings are discrete events, and a line drawn through them
 * implies a continuous quantity nobody measured in between.
 *
 * Built from ordinary elements, not SVG. There is nothing to draw here but
 * boxes, and boxes get CSS sizing at any width with no resize listener, a real
 * `border-radius` instead of an `rx` that distorts under a stretched viewBox,
 * and a native tooltip each.
 */
export const BarChart = ({ points }: { points: BarPoint[] }) => {
  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="bars">
      <div className="bars__plot">
        {[0, 25, 50, 75, 100].map((line) => (
          // Gridlines behind the bars, so a value can be read without a y-axis
          // taking a fifth of the width.
          <span key={line} className="bars__grid" style={{ bottom: `${line}%` }} />
        ))}

        {points.map((point, index) => (
          <div
            key={`${point.label}-${index}`}
            className="bars__col"
            title={`${point.label}: ${point.display ?? point.value}`}
          >
            <span
              className={`bars__bar${point.value === 0 ? ' is-zero' : ''}`}
              /*
               * A floor of 2% so a day with one small sale is still a visible
               * mark rather than an invisible sliver beside a busy day — which
               * reads as "nothing happened", the opposite of the truth.
               */
              style={{ height: `${point.value === 0 ? 0 : Math.max(2, (point.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>

      <div className="bars__axis">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
};

/* --------------------------------- donut ---------------------------------- */

export interface DonutSlice {
  label: string;
  value: number;
  colour: string;
}

const R = 15.915;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * A ring, drawn as dashed circle strokes.
 *
 * One circle per slice, each with a dash as long as its share and an offset
 * placing it after the ones before. That is far less arithmetic than arc paths
 * and cannot produce the malformed `A` command that a hand-rolled arc does at
 * exactly 100%.
 *
 * Percentages are rounded for display but the geometry uses the exact fraction:
 * rounding first makes three slices of 33.33% leave a visible gap in the ring.
 */
export const Donut = ({
  data,
  caption,
  thickness = 5,
}: {
  data: DonutSlice[];
  caption: string;
  thickness?: number;
}) => {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  let consumed = 0;
  const slices = data.map((slice) => {
    const fraction = total > 0 ? slice.value / total : 0;
    const dash = fraction * CIRCUMFERENCE;
    // SVG dash offsets run backwards, hence the subtraction.
    const offset = CIRCUMFERENCE - consumed;
    consumed += dash;
    return {
      ...slice,
      dash,
      offset,
      percent: Math.round(fraction * 100),
    };
  });

  return (
    <div className="donut">
      <svg
        className="donut__svg"
        viewBox="0 0 42 42"
        role="img"
        aria-label={`${caption}: ${data.map((s) => `${s.label} ${s.value}`).join(', ')}`}
      >
        {/* A track, so an empty or partial chart still reads as a ring rather
            than as a chart that failed to draw. */}
        <circle
          className="donut__track"
          cx="21"
          cy="21"
          r={R}
          fill="none"
          strokeWidth={thickness}
        />
        {slices.map((slice) => (
          <circle
            key={slice.label}
            className="donut__slice"
            cx="21"
            cy="21"
            r={R}
            fill="none"
            stroke={slice.colour}
            strokeWidth={thickness}
            strokeDasharray={`${slice.dash} ${CIRCUMFERENCE - slice.dash}`}
            strokeDashoffset={slice.offset}
          >
            <title>{`${slice.label}: ${slice.value} (${slice.percent}%)`}</title>
          </circle>
        ))}
      </svg>

      <div className="donut__centre">
        <span className="donut__total">{total}</span>
        <span className="donut__caption">{caption}</span>
      </div>
    </div>
  );
};
