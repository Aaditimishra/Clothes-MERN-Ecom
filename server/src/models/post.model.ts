import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * A journal post.
 *
 * Separate from content pages rather than a sixth block type: a post is dated,
 * listed newest-first, has an author and a cover image, and links out to
 * products. A page is none of those things. Forcing both through one model would
 * mean every page carrying fields it never uses.
 */
const postSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    title: { type: String, required: true, trim: true },
    /** One or two sentences. Used on the card and as the meta description. */
    excerpt: { type: String, default: '' },
    coverUrl: { type: String, default: null },
    coverAlt: { type: String, default: '' },
    author: { type: String, default: '' },
    /** e.g. `Fabric`, `Fit`, `Lookbook`. Drives the filter chips. */
    category: { type: String, default: null, index: true },
    readMinutes: { type: Number, default: 3 },
    /** Paragraphs separated by blank lines; `## ` marks a subheading. */
    body: { type: String, default: '' },
    /**
     * Products mentioned in the piece.
     *
     * A journal that cannot send anyone to a garment is a blog, not a shop's
     * journal — this is what makes an article worth writing commercially.
     */
    productSlugs: { type: [String], default: [] },
    isPublished: { type: Boolean, default: true, index: true },
    publishedAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true, collection: 'posts', _id: false },
);

postSchema.index({ isPublished: 1, publishedAt: -1 });
// The ADMIN journal list is unfiltered, so the compound index above — which
// leads with `isPublished` — cannot serve its sort.
postSchema.index({ publishedAt: -1, _id: 1 });

export type PostDoc = InferSchemaType<typeof postSchema>;
export const PostModel = model('Post', postSchema);
