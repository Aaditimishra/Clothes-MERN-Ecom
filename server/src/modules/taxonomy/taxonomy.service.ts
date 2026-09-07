import { newId, slugify } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import {
  TaxonomyTermModel,
  type TaxonomyGroup,
  type TaxonomyTermDoc,
} from '../../models/taxonomy.model';

export interface TaxonomyTermView {
  id: string;
  group: TaxonomyGroup;
  code: string;
  label: string;
  swatch: string | null;
  position: number;
  isActive: boolean;
  isFilterable: boolean;
}

const toView = (doc: TaxonomyTermDoc): TaxonomyTermView => ({
  id: doc._id,
  group: doc.group as TaxonomyGroup,
  code: doc.code,
  label: doc.label,
  swatch: doc.swatch ?? null,
  position: doc.position ?? 0,
  isActive: doc.isActive ?? true,
  isFilterable: doc.isFilterable ?? true,
});

/**
 * The vocabulary is read on nearly every request and written a few times a week.
 *
 * An in-process cache turns "one query per facet per listing" into one query per
 * minute. It is invalidated explicitly on every write rather than left to expire,
 * so a merchant who renames a colour sees it immediately instead of wondering
 * whether the save worked.
 *
 * Single-process only — behind several instances each keeps its own copy and
 * converges within the TTL. That is the right trade for a vocabulary: a label
 * that is 60 seconds stale on one node is not a correctness problem, and the
 * alternative is a Redis dependency this shop does not otherwise need.
 */
const CACHE_TTL_MS = 60_000;

let cache: { at: number; terms: TaxonomyTermDoc[] } | null = null;

export const invalidateTaxonomyCache = (): void => {
  cache = null;
};

const allTerms = async (): Promise<TaxonomyTermDoc[]> => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.terms;

  const terms = await TaxonomyTermModel.find().sort({ group: 1, position: 1, label: 1 }).lean();
  cache = { at: Date.now(), terms };
  return terms;
};

/** Every active term in a group, in the merchant's chosen order. */
export const termsIn = async (group: TaxonomyGroup): Promise<TaxonomyTermView[]> => {
  const terms = await allTerms();
  return terms.filter((term) => term.group === group && term.isActive).map(toView);
};

/** `code → term`, for resolving a label or swatch during a request. */
export const termMap = async (
  group: TaxonomyGroup,
): Promise<ReadonlyMap<string, TaxonomyTermView>> => {
  const terms = await termsIn(group);
  return new Map(terms.map((term) => [term.code, term]));
};

/** Everything, grouped — what the admin screen and the storefront both load. */
export const groupedTaxonomy = async (): Promise<Record<string, TaxonomyTermView[]>> => {
  const terms = await allTerms();
  const grouped: Record<string, TaxonomyTermView[]> = {};

  for (const term of terms) {
    if (!term.isActive) continue;
    (grouped[term.group] ??= []).push(toView(term));
  }

  return grouped;
};

/** Admin listing includes inactive terms — you cannot re-enable what you cannot see. */
export const listAllTerms = async (group?: TaxonomyGroup): Promise<TaxonomyTermView[]> => {
  const terms = await allTerms();
  return terms.filter((term) => !group || term.group === group).map(toView);
};

export interface TermInput {
  group: TaxonomyGroup;
  code?: string;
  label: string;
  swatch?: string | null;
  position?: number;
  isActive?: boolean;
  isFilterable?: boolean;
}

export const createTerm = async (input: TermInput): Promise<TaxonomyTermView> => {
  const code = slugify(input.code ?? input.label);
  if (!code) {
    throw ApiError.badRequest('Cannot derive a code from that label', {
      label: 'Use at least one letter or number',
    });
  }

  if (await TaxonomyTermModel.exists({ group: input.group, code })) {
    throw ApiError.conflict(`'${code}' already exists in ${input.group}`, {
      code: 'Already in use',
    });
  }

  const created = await TaxonomyTermModel.create({
    _id: newId('tax'),
    group: input.group,
    code,
    label: input.label.trim(),
    swatch: input.swatch ?? null,
    position: input.position ?? 0,
    isActive: input.isActive ?? true,
    isFilterable: input.isFilterable ?? true,
  });

  invalidateTaxonomyCache();
  return toView(created.toObject());
};

/**
 * The `code` is deliberately NOT editable.
 *
 * Products reference terms by code. Changing it would orphan every product using
 * the old value — silently, because a filter that matches nothing looks like an
 * empty category rather than an error. Labels are free to change; codes are not.
 */
export const updateTerm = async (
  id: string,
  patch: Partial<Omit<TermInput, 'group' | 'code'>>,
): Promise<TaxonomyTermView> => {
  const updated = await TaxonomyTermModel.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
        ...(patch.swatch !== undefined ? { swatch: patch.swatch } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.isFilterable !== undefined ? { isFilterable: patch.isFilterable } : {}),
      },
    },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('No such term');

  invalidateTaxonomyCache();
  return toView(updated);
};

/**
 * Deactivates rather than deletes.
 *
 * A colour that has been sold cannot be removed: order lines reference it, and a
 * shop that loses the name of what it shipped cannot answer a customer question.
 * Deactivating hides it from the filter panel and the product editor while
 * leaving history readable.
 */
export const deactivateTerm = async (id: string): Promise<TaxonomyTermView> =>
  updateTerm(id, { isActive: false });

/** Bulk reorder from the admin's drag handles, in one round trip. */
export const reorderTerms = async (
  order: Array<{ id: string; position: number }>,
): Promise<void> => {
  if (order.length === 0) return;

  await TaxonomyTermModel.bulkWrite(
    order.map((entry) => ({
      updateOne: { filter: { _id: entry.id }, update: { $set: { position: entry.position } } },
    })),
  );

  invalidateTaxonomyCache();
};
