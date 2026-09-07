import { newId, slugify, type ProductSummaryView } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { PostModel, type PostDoc } from '../../models/post.model';
import { ProductModel, type ProductDoc } from '../../models/product.model';
import { toSummary } from '../catalog/catalog.mapper';

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  coverAlt: string;
  author: string;
  category: string | null;
  readMinutes: number;
  publishedAt: string;
}

export interface PostDetail extends PostSummary {
  body: string;
  /** Resolved at read time so a renamed or archived product cannot 404 a post. */
  products: ProductSummaryView[];
}

const toSummaryView = (doc: PostDoc): PostSummary => ({
  id: doc._id,
  slug: doc.slug,
  title: doc.title,
  excerpt: doc.excerpt ?? '',
  coverUrl: doc.coverUrl ?? null,
  coverAlt: doc.coverAlt ?? '',
  author: doc.author ?? '',
  category: doc.category ?? null,
  readMinutes: doc.readMinutes ?? 3,
  publishedAt: (doc.publishedAt ?? new Date()).toISOString(),
});

export const listPosts = async (params: {
  category?: string;
  limit?: number;
}): Promise<{ items: PostSummary[]; categories: string[] }> => {
  const filter: Record<string, unknown> = { isPublished: true };
  if (params.category) filter.category = params.category;

  const [docs, categories] = await Promise.all([
    PostModel.find(filter)
      .sort({ publishedAt: -1, _id: 1 })
      .limit(params.limit ?? 24)
      .lean(),
    PostModel.distinct('category', { isPublished: true, category: { $ne: null } }),
  ]);

  return {
    items: docs.map(toSummaryView),
    categories: (categories as string[]).filter(Boolean).sort(),
  };
};

export const getPost = async (slug: string): Promise<PostDetail> => {
  const post = await PostModel.findOne({ slug, isPublished: true }).lean();
  if (!post) throw ApiError.notFound(`No journal entry at '${slug}'`);

  const products =
    post.productSlugs.length > 0
      ? await ProductModel.find({ slug: { $in: post.productSlugs }, status: 'active' }).lean()
      : [];

  return {
    ...toSummaryView(post),
    body: post.body ?? '',
    products: (products as ProductDoc[]).map(toSummary),
  };
};

/**
 * What the admin list needs and the storefront one must not have: the draft
 * flag, and the raw product slugs rather than resolved products.
 *
 * The editor writes back whatever it was handed, so anything missing here is
 * silently erased on the next save — `isPublished` and `productSlugs` were,
 * which would have unpublished every post the moment someone fixed a typo.
 */
export interface PostAdminView extends PostSummary {
  body: string;
  productSlugs: string[];
  isPublished: boolean;
}

const toAdminView = (doc: PostDoc): PostAdminView => ({
  ...toSummaryView(doc),
  body: doc.body ?? '',
  productSlugs: doc.productSlugs ?? [],
  isPublished: doc.isPublished ?? true,
});

export const listAllPosts = async (): Promise<PostAdminView[]> => {
  const docs = await PostModel.find().sort({ publishedAt: -1 }).lean();
  return docs.map(toAdminView);
};

export interface PostInput {
  slug?: string;
  title: string;
  excerpt?: string;
  coverUrl?: string | null;
  coverAlt?: string;
  author?: string;
  category?: string | null;
  readMinutes?: number;
  body: string;
  productSlugs?: string[];
  isPublished?: boolean;
}

export const savePost = async (input: PostInput, id?: string): Promise<PostAdminView> => {
  const slug = slugify(input.slug ?? input.title);
  if (!slug) throw ApiError.badRequest('Cannot derive a URL from that title', { slug: 'Enter a slug' });

  const clash = await PostModel.exists({ slug, ...(id ? { _id: { $ne: id } } : {}) });
  if (clash) throw ApiError.conflict(`'${slug}' is already used`, { slug: 'Already in use' });

  const payload = {
    slug,
    title: input.title.trim(),
    excerpt: input.excerpt ?? '',
    coverUrl: input.coverUrl ?? null,
    coverAlt: input.coverAlt ?? '',
    author: input.author ?? '',
    category: input.category || null,
    readMinutes: input.readMinutes ?? 3,
    body: input.body,
    productSlugs: input.productSlugs ?? [],
    isPublished: input.isPublished ?? true,
  };

  const saved = id
    ? await PostModel.findByIdAndUpdate(id, { $set: payload }, { new: true }).lean()
    : (await PostModel.create({ _id: newId('pst'), ...payload, publishedAt: new Date() })).toObject();

  if (!saved) throw ApiError.notFound('No such journal entry');
  return toAdminView(saved);
};

export const deletePost = async (id: string): Promise<void> => {
  const result = await PostModel.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw ApiError.notFound('No such journal entry');
};
