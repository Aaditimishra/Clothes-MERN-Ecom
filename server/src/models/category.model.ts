import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * The merchandising tree a shopper browses: Women → Dresses → Midi.
 *
 * Distinct from a product's attributes. Attributes say what a garment IS
 * (fabric, fit); a category says where it SITS in the shop. Conflating the two
 * is why some platforms cannot sell one dress under both "Dresses" and
 * "Occasion Wear".
 */
const categorySchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    department: { type: String, default: null },
    parentId: { type: String, default: null, index: true },
    /**
     * Materialised path: ancestor ids, root first.
     *
     * Indexed because "everything under Women, at any depth" is the single most
     * common storefront query. With the path it is one indexed lookup; without
     * it, a recursive walk on every page load.
     */
    path: { type: [String], default: [], index: true },
    position: { type: Number, default: 0 },
    imageUrl: { type: String, default: null },
    isVisible: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'categories', _id: false },
);

categorySchema.index({ parentId: 1, position: 1 });

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const CategoryModel = model('Category', categorySchema);
