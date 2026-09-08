import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * A reusable body-measurement chart.
 *
 * Separated from the product because one chart serves many garments — every
 * women's dress shares a chart, and editing it once must update all of them. A
 * chart embedded per product would drift the moment a merchant corrected a
 * single measurement.
 */
const sizeChartColumnSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const sizeChartRowSchema = new Schema(
  {
    size: { type: String, required: true },
    /** Measurement code → value. Free-form so a chart can carry inseam,
     *  shoulder or sleeve without a schema change. */
    values: { type: Map, of: Number, default: {} },
  },
  { _id: false },
);

const sizeChartSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    /** `cm` or `in`. Shown in the dialog header so a number is never ambiguous. */
    unit: { type: String, required: true, default: 'cm' },
    /** Column definitions, in display order: `[{ code:'chest', label:'Chest' }]` */
    columns: { type: [sizeChartColumnSchema], default: [] },
    rows: { type: [sizeChartRowSchema], default: [] },
    /** A note under the table — "If between sizes, size up." */
    note: { type: String, default: null },
  },
  { timestamps: true, collection: 'size_charts', _id: false },
);

// The size-chart list, alphabetical.
sizeChartSchema.index({ name: 1, _id: 1 });

export type SizeChartDoc = InferSchemaType<typeof sizeChartSchema>;
export const SizeChartModel = model('SizeChart', sizeChartSchema);
