import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * A content block.
 *
 * Blocks rather than one blob of HTML: a merchant editing "Delivery & Returns"
 * should not be able to break the page layout, and a rich-text field that accepts
 * arbitrary markup is both a styling problem and an XSS one. Each block type has
 * a shape the storefront knows how to render.
 */
export const BLOCK_TYPES = ['richText', 'faq', 'steps', 'callout', 'contact'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const blockSchema = new Schema(
  {
    type: { type: String, required: true },
    /** Optional heading above the block. */
    heading: { type: String, default: '' },
    /** `richText` and `callout`: plain paragraphs, split on blank lines. */
    body: { type: String, default: '' },
    /** `faq`: question/answer pairs. `steps`: title/detail pairs. */
    items: {
      type: [{ _id: false, title: String, detail: String }],
      default: [],
    },
  },
  { _id: false },
);

const pageSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    title: { type: String, required: true, trim: true },
    /** Shown under the title, and used as the meta description. */
    summary: { type: String, default: '' },
    blocks: { type: [blockSchema], default: [] },
    /**
     * Where the page is linked from, so the footer builds itself.
     *
     * A merchant adding a "Sustainability" page should not need a developer to
     * put a link to it anywhere.
     */
    footerGroup: { type: String, default: null },
    position: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'pages', _id: false },
);

pageSchema.index({ footerGroup: 1, position: 1 });

export type PageDoc = InferSchemaType<typeof pageSchema>;
export const PageModel = model('Page', pageSchema);
