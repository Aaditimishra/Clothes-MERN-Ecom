import type { Size, SizeChartView } from '@shop/shared';

import { SizeChartModel } from '../../models/size-chart.model';

/**
 * The shape the mapper needs, declared structurally.
 *
 * Not the ODM's inferred document type: `lean()` returns a `FlattenMaps<…>`
 * whose subdocument arrays are a different type again, and threading that
 * through every signature buys nothing. What matters is the fields.
 */
interface SizeChartShape {
  _id: string;
  name: string;
  unit: string;
  columns: Array<{ code: string; label: string }>;
  rows: Array<{ size: string; values: unknown }>;
  note?: string | null;
}

/**
 * `values` is a Mongo Map, which `lean()` returns as a plain object in newer
 * drivers and as a Map in older ones. Normalising here means the mapper never
 * has to care which.
 */
const toValues = (raw: unknown): Record<string, number> => {
  if (raw instanceof Map) return Object.fromEntries(raw) as Record<string, number>;
  return (raw ?? {}) as Record<string, number>;
};

export const toSizeChartView = (doc: SizeChartShape): SizeChartView => ({
  id: doc._id,
  name: doc.name,
  unit: doc.unit,
  columns: doc.columns.map((column) => ({ code: column.code, label: column.label })),
  rows: doc.rows.map((row) => ({
    size: row.size as Size,
    values: toValues(row.values),
  })),
  note: doc.note ?? null,
});

export const findSizeChart = async (id: string | null): Promise<SizeChartView | null> => {
  if (!id) return null;
  const chart = await SizeChartModel.findById(id).lean<SizeChartShape | null>();
  return chart ? toSizeChartView(chart) : null;
};

export const listSizeCharts = async (): Promise<SizeChartView[]> => {
  const charts = await SizeChartModel.find().sort({ name: 1 }).lean<SizeChartShape[]>();
  return charts.map(toSizeChartView);
};
