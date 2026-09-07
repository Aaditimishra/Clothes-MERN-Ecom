import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * An uploaded image.
 *
 * The document stores the storage KEY, never a URL. The URL is rebuilt on read
 * from whichever storage adapter is active, so moving the shop from local disk
 * to S3 or Cloudinary later does not require rewriting a single record.
 */
const mediaSchema = new Schema(
  {
    _id: { type: String, required: true },
    filename: { type: String, required: true },
    /**
     * `image` or `video`.
     *
     * Stored rather than derived from the mime type on every read: the gallery
     * has to decide between an `<img>` and a `<video>` before it knows anything
     * else about the asset, and parsing a mime string in three places is three
     * places to get it wrong.
     */
    kind: { type: String, required: true, default: 'image', index: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    /** Path within the storage root, e.g. `2026-09/abc123.webp`. */
    key: { type: String, required: true, unique: true },
    provider: { type: String, required: true, default: 'local' },
    /**
     * Alt text is a first-class field, not an afterthought.
     *
     * It is the only thing a screen-reader user gets from a product photo, and
     * the only thing a search engine can read. Stored on the asset so it follows
     * the image everywhere it is used.
     */
    alt: { type: String, default: '' },
    /** Video only. Shown as the still before playback, and in every grid. */
    posterUrl: { type: String, default: null },
    /** Video only, in seconds. Rendered as a duration badge on the thumbnail. */
    durationSeconds: { type: Number, default: null },
    /** Free tags so a merchant can find "the olive jacket shots" later. */
    tags: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'media', _id: false },
);

mediaSchema.index({ createdAt: -1 });
mediaSchema.index({ tags: 1 });

export type MediaDoc = InferSchemaType<typeof mediaSchema>;
export const MediaModel = model('Media', mediaSchema);
