import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * A bag line stores WHAT, never HOW MUCH.
 *
 * A bag can sit for a week. Storing the price would mean either honouring a
 * stale one (a loss for the shop) or silently changing it at checkout (a broken
 * promise to the shopper). Prices are resolved from the variant on every read,
 * by the same pricing code checkout uses.
 */
const cartLineSchema = new Schema(
  {
    productId: { type: String, required: true },
    variantId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    addedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    _id: { type: String, required: true },
    /** Set once a guest signs in, so their bag survives the transition. */
    customerId: { type: String, default: null, index: true },
    lines: { type: [cartLineSchema], default: [] },
    couponCode: { type: String, default: null },
    /**
     * Abandoned guest bags are swept after 30 days.
     *
     * A TTL index rather than a cron job: the database already knows how to
     * expire documents, and a cron that stops running leaves a collection that
     * grows without bound until someone notices the disk.
     */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true, collection: 'carts', _id: false },
);

export type CartDoc = InferSchemaType<typeof cartSchema>;
export const CartModel = model('Cart', cartSchema);
