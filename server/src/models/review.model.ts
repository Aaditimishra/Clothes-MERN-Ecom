import { model, Schema, type InferSchemaType } from 'mongoose';

const reviewSchema = new Schema(
  {
    _id: { type: String, required: true },
    productId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: null },
    body: { type: String, required: true },
    /**
     * The apparel-specific field that earns its place.
     *
     * The most useful thing a shopper learns from a stranger is whether the
     * garment ran small. Aggregated, it becomes the "Runs small — consider
     * sizing up" note that prevents the return.
     */
    fitFeedback: { type: String, default: null },
    sizePurchased: { type: String, default: null },
    isVerifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'reviews', _id: false },
);

// One review per customer per product. Enforced by the database rather than a
// read-then-write check, which races under concurrent submits.
reviewSchema.index({ productId: 1, customerId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, createdAt: -1 });
/**
 * The admin moderation queue: every review, newest first, no filter.
 *
 * The index above starts with `productId`, so it cannot serve an unfiltered
 * sort — that listing read all 131 reviews and sorted them in memory to show 25.
 */
reviewSchema.index({ createdAt: -1, _id: 1 });

export type ReviewDoc = InferSchemaType<typeof reviewSchema>;
export const ReviewModel = model('Review', reviewSchema);
