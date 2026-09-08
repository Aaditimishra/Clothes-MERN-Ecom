import type { Model, FilterQuery } from 'mongoose';

/**
 * The one shape every list endpoint answers with.
 *
 * Uniform on purpose: the panel has one `Pager`, and a screen that had to know
 * whether its endpoint returned a bare array or an envelope is a screen that
 * will get it wrong. Every list is now the envelope.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

/**
 * Pages a collection at the DATABASE, not in memory.
 *
 * Reading every row and slicing the array would give the same JSON and none of
 * the benefit: Mongo would still walk the whole collection, serialise it and
 * send it, and the API would still hold all of it in memory to throw most away.
 * `skip`/`limit` push the work down to the index.
 *
 * `countDocuments` runs alongside rather than after — the two are independent,
 * and awaiting them in sequence doubles the latency of every list in the panel
 * for no reason.
 */
export const paginate = async <T, R>(
  model: Model<T>,
  params: {
    filter?: FilterQuery<T>;
    sort: Record<string, 1 | -1>;
    query: PageQuery;
    map: (doc: T) => R;
    /** Fields to fetch. Given, the rest never leave the database. */
    select?: string;
  },
): Promise<Page<R>> => {
  const { page, pageSize } = params.query;
  const filter = (params.filter ?? {}) as FilterQuery<T>;

  const finder = model
    .find(filter)
    .sort(params.sort)
    .skip((page - 1) * pageSize)
    .limit(pageSize);

  if (params.select) finder.select(params.select);

  const [docs, total] = await Promise.all([
    finder.lean(),
    model.countDocuments(filter),
  ]);

  return {
    items: (docs as T[]).map(params.map),
    total,
    page,
    pageSize,
    // At least one, so an empty list reads as "page 1 of 1" rather than
    // "page 1 of 0" — which looks like a fault and disables both arrows.
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
};

/** Wraps an already-built array in the same envelope. */
export const pageOf = <T>(items: T[], query: PageQuery, total = items.length): Page<T> => ({
  items,
  total,
  page: query.page,
  pageSize: query.pageSize,
  pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
});
