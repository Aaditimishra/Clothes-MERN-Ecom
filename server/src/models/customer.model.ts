import { model, Schema, type InferSchemaType } from 'mongoose';

const addressSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: 'Home' },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: null },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'IN' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * A saved payment method.
 *
 * Stores ONLY what is safe to keep and enough to recognise the card: the brand,
 * the last four digits and the expiry. No PAN, no CVV, no token that could be
 * charged on its own — a real gateway holds those, and this shop deliberately
 * cannot. Keeping a full card number would put this database in PCI scope, which
 * is a promise a demo has no business making.
 */
const paymentMethodSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ['card', 'upi'] },
    /** Cards: `visa`, `mastercard`, `rupay`. UPI: the handle's provider. */
    brand: { type: String, default: null },
    /** Cards only. Exactly four digits. */
    last4: { type: String, default: null },
    /** UPI only, e.g. `aditi@okhdfc`. Safe to store; it is a public handle. */
    upiId: { type: String, default: null },
    expiryMonth: { type: Number, default: null },
    expiryYear: { type: Number, default: null },
    label: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

const customerSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    /**
     * Never selected by default.
     *
     * `select: false` means a plain `findById` cannot leak the hash into a JSON
     * response, even if someone later returns the raw document by mistake. The
     * one query that needs it asks for it explicitly.
     */
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    addresses: { type: [addressSchema], default: [] },
    /** Product ids. Small and read on every page, so it lives on the customer. */
    wishlist: { type: [String], default: [] },
    paymentMethods: { type: [paymentMethodSchema], default: [] },
    /** Marketing opt-in. Absent means never asked, which is not the same as no. */
    acceptsMarketing: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'customers', _id: false },
);

export type CustomerDoc = InferSchemaType<typeof customerSchema>;
export type AddressDoc = CustomerDoc['addresses'][number];
export const CustomerModel = model('Customer', customerSchema);
