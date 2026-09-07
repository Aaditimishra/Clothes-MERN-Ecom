import { newId, slugify } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { PageModel, type BlockType } from '../../models/page.model';

export interface ContentBlock {
  type: BlockType;
  heading: string;
  body: string;
  items: Array<{ title: string; detail: string }>;
}

export interface PageView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  blocks: ContentBlock[];
  footerGroup: string | null;
  position: number;
  isPublished: boolean;
}

/**
 * What `toView` actually reads, as plain data.
 *
 * `InferSchemaType<PageDoc>` types the nested blocks as mongoose DocumentArrays,
 * which `.lean()` results — wrapped in `FlattenMaps` — are not assignable to.
 * Every caller here is lean, so the mapper is typed against the shape it reads
 * rather than against the hydrated document it never receives.
 */
interface LeanPage {
  _id: string;
  slug: string;
  title: string;
  summary?: string | null;
  blocks: ReadonlyArray<{
    type: string;
    heading?: string | null;
    body?: string | null;
    items: ReadonlyArray<{ title?: string | null; detail?: string | null }>;
  }>;
  footerGroup?: string | null;
  position?: number | null;
  isPublished?: boolean | null;
}

const toView = (doc: LeanPage): PageView => ({
  id: doc._id,
  slug: doc.slug,
  title: doc.title,
  summary: doc.summary ?? '',
  blocks: doc.blocks.map((block) => ({
    type: block.type as BlockType,
    heading: block.heading ?? '',
    body: block.body ?? '',
    items: block.items.map((item) => ({ title: item.title ?? '', detail: item.detail ?? '' })),
  })),
  footerGroup: doc.footerGroup ?? null,
  position: doc.position ?? 0,
  isPublished: doc.isPublished ?? true,
});

export const getPage = async (slug: string): Promise<PageView> => {
  const page = await PageModel.findOne({ slug, isPublished: true }).lean();
  if (!page) throw ApiError.notFound(`No page at '${slug}'`);
  return toView(page);
};

/**
 * The footer's link list, grouped.
 *
 * Only slug and title cross the wire — the footer renders on every page, and
 * shipping the full body of six content pages with it would be wasteful.
 */
export const footerLinks = async (): Promise<
  Record<string, Array<{ slug: string; title: string }>>
> => {
  const pages = await PageModel.find({ isPublished: true, footerGroup: { $ne: null } })
    .select('slug title footerGroup position')
    .sort({ position: 1, title: 1 })
    .lean();

  const grouped: Record<string, Array<{ slug: string; title: string }>> = {};
  for (const page of pages) {
    (grouped[page.footerGroup!] ??= []).push({ slug: page.slug, title: page.title });
  }

  return grouped;
};

export const listPages = async (): Promise<PageView[]> => {
  const pages = await PageModel.find().sort({ footerGroup: 1, position: 1, title: 1 }).lean();
  return pages.map(toView);
};

export interface PageInput {
  slug?: string;
  title: string;
  summary?: string;
  blocks: ContentBlock[];
  footerGroup?: string | null;
  position?: number;
  isPublished?: boolean;
}

const assertUniqueSlug = async (slug: string, exceptId?: string): Promise<void> => {
  const clash = await PageModel.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (clash) throw ApiError.conflict(`'${slug}' is already used`, { slug: 'Already in use' });
};

export const savePage = async (input: PageInput, id?: string): Promise<PageView> => {
  const slug = slugify(input.slug ?? input.title);
  if (!slug) {
    throw ApiError.badRequest('Cannot derive a URL from that title', { slug: 'Enter a slug' });
  }
  await assertUniqueSlug(slug, id);

  const payload = {
    slug,
    title: input.title.trim(),
    summary: input.summary ?? '',
    blocks: input.blocks,
    footerGroup: input.footerGroup || null,
    position: input.position ?? 0,
    isPublished: input.isPublished ?? true,
  };

  const saved = id
    ? await PageModel.findByIdAndUpdate(id, { $set: payload }, { new: true }).lean()
    : (await PageModel.create({ _id: newId('pag'), ...payload })).toObject();

  if (!saved) throw ApiError.notFound('No such page');
  return toView(saved);
};

export const deletePage = async (id: string): Promise<void> => {
  const result = await PageModel.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw ApiError.notFound('No such page');
};
