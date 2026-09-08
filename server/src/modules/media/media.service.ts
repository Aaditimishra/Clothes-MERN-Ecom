import sharp from 'sharp';
import { newId, slugify } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { MediaModel, type MediaDoc } from '../../models/media.model';
import { ProductModel } from '../../models/product.model';
import { monthlyPrefix, publicUrl, putObject, removeObject } from './media.storage';

export interface MediaView {
  id: string;
  filename: string;
  kind: 'image' | 'video';
  url: string;
  posterUrl: string | null;
  durationSeconds: number | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  tags: string[];
  provider: string;
  createdAt: string;
}

export const toMediaView = (doc: MediaDoc): MediaView => ({
  id: doc._id,
  filename: doc.filename,
  kind: (doc.kind as 'image' | 'video') ?? 'image',
  url: publicUrl(doc.key),
  posterUrl: doc.posterUrl ? publicUrl(doc.posterUrl) : null,
  durationSeconds: doc.durationSeconds ?? null,
  mimeType: doc.mimeType,
  size: doc.size,
  width: doc.width ?? null,
  height: doc.height ?? null,
  alt: doc.alt ?? '',
  tags: [...doc.tags],
  provider: doc.provider,
  createdAt: (doc.createdAt ?? new Date()).toISOString(),
});

/**
 * Product photography is large and rarely needs to be.
 *
 * Everything is re-encoded to WebP and capped at 1600px on the long edge: a
 * 6 MB phone photograph becomes roughly 200 KB with no visible loss at the size
 * a browser actually renders it. Doing this on upload rather than on request
 * means it happens once, not once per visitor.
 */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 82;

/**
 * The formats a browser can play without a plugin or a transcoding step.
 *
 * Deliberately short. Accepting a `.mov` straight off a phone would upload fine
 * and then fail to play for half the shop's visitors, which is worse than
 * refusing it with a message naming what to convert to.
 */
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

/** Videos are stored as uploaded; only the size is bounded. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const uploadImage = async (file: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}): Promise<MediaView> => {
  if (VIDEO_TYPES.includes(file.mimetype)) return uploadVideo(file);

  if (!file.mimetype.startsWith('image/')) {
    throw ApiError.badRequest('That file type is not supported', {
      file: 'Upload a JPEG, PNG or WebP image, or an MP4 or WebM video',
    });
  }

  let processed: Buffer;
  let width: number | null = null;
  let height: number | null = null;

  try {
    const pipeline = sharp(file.buffer).rotate().resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const output = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer({
      resolveWithObject: true,
    });

    processed = output.data;
    width = output.info.width;
    height = output.info.height;
  } catch {
    // A file that claims to be an image but will not decode is a corrupt upload,
    // not a server fault — say so with a 400 rather than a 500.
    throw ApiError.badRequest('That file could not be read as an image', {
      file: 'The file appears to be corrupt',
    });
  }

  const base = slugify(file.originalname.replace(/\.[^.]+$/, '')) || 'image';
  const key = `${monthlyPrefix()}/${base}-${newId('m').split('_')[1]}.webp`;

  await putObject(key, processed);

  const created = await MediaModel.create({
    _id: newId('med'),
    filename: file.originalname,
    kind: 'image',
    mimeType: 'image/webp',
    size: processed.length,
    width,
    height,
    key,
    provider: 'local',
    // Seeded blank on purpose. A generated alt like "product photo" is worse
    // than none: it tells a screen-reader user nothing and suppresses the
    // browser's own fallback. The admin prompts for real text instead.
    alt: '',
    tags: [],
  });

  return toMediaView(created.toObject());
};

/**
 * Stores a video as uploaded.
 *
 * No transcoding: doing it properly needs ffmpeg and a job queue, and doing it
 * badly — a synchronous re-encode inside the request — would hold a connection
 * open for minutes and still produce a worse file than the merchant's own
 * export. Accepting only web-playable formats is the honest trade.
 */
const uploadVideo = async (file: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}): Promise<MediaView> => {
  if (file.buffer.length > MAX_VIDEO_BYTES) {
    throw ApiError.badRequest('That video is too large', {
      file: `Keep videos under ${MAX_VIDEO_BYTES / 1024 / 1024} MB`,
    });
  }

  const extension = file.mimetype === 'video/webm' ? 'webm' : 'mp4';
  const base = slugify(file.originalname.replace(/\.[^.]+$/, '')) || 'video';
  const key = `${monthlyPrefix()}/${base}-${newId('v').split('_')[1]}.${extension}`;

  await putObject(key, file.buffer);

  const created = await MediaModel.create({
    _id: newId('med'),
    filename: file.originalname,
    kind: 'video',
    mimeType: file.mimetype,
    size: file.buffer.length,
    key,
    provider: 'local',
    alt: '',
    // A poster is set afterwards by pointing at an image already in the library.
    // Extracting a frame server-side is the same ffmpeg dependency again.
    posterUrl: null,
    tags: [],
  });

  return toMediaView(created.toObject());
};

/** Registers an image that lives on someone else's server, e.g. the seeds. */
export const registerExternalImage = async (input: {
  url: string;
  filename: string;
  alt?: string;
  tags?: string[];
}): Promise<MediaDoc> => {
  const created = await MediaModel.create({
    _id: newId('med'),
    filename: input.filename,
    mimeType: 'image/jpeg',
    size: 0,
    kind: 'image',
    key: input.url,
    provider: 'external',
    alt: input.alt ?? '',
    tags: input.tags ?? [],
  });

  return created.toObject();
};

export const listMedia = async (params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{
  items: MediaView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> => {
  const filter = params.search
    ? {
        $or: [
          { filename: { $regex: params.search, $options: 'i' } },
          { alt: { $regex: params.search, $options: 'i' } },
          { tags: params.search.toLowerCase() },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    MediaModel.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((params.page - 1) * params.pageSize)
      .limit(params.pageSize)
      .lean(),
    MediaModel.countDocuments(filter),
  ]);

  return {
    items: items.map(toMediaView),
    total,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
};

export const updateMedia = async (
  id: string,
  patch: { alt?: string; tags?: string[]; posterMediaId?: string | null },
): Promise<MediaView> => {
  const updated = await MediaModel.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.posterMediaId !== undefined
          ? { posterUrl: await resolvePosterKey(patch.posterMediaId) }
          : {}),
      },
    },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('No such image');

  // Alt text is denormalised onto the products using this asset, so changing it
  // here fixes every page it appears on rather than only the library.
  if (patch.alt !== undefined) {
    await ProductModel.updateMany(
      { 'colourways.images.mediaId': id },
      { $set: { 'colourways.$[].images.$[image].alt': patch.alt } },
      { arrayFilters: [{ 'image.mediaId': id }] },
    );
  }

  return toMediaView(updated);
};

/** A poster is another asset in the library, referenced by its storage key. */
const resolvePosterKey = async (mediaId: string | null): Promise<string | null> => {
  if (!mediaId) return null;
  const poster = await MediaModel.findById(mediaId).select('key kind').lean();
  if (!poster) throw ApiError.badRequest('No such poster image', { posterMediaId: 'Unknown' });
  if (poster.kind === 'video') {
    throw ApiError.badRequest('A poster must be an image', { posterMediaId: 'Pick an image' });
  }
  return poster.key;
};

/** Which products would break if this image were removed. */
export const mediaUsage = async (id: string): Promise<Array<{ id: string; name: string }>> => {
  const products = await ProductModel.find({ 'colourways.images.mediaId': id })
    .select('name')
    .lean();

  return products.map((product) => ({ id: product._id, name: product.name }));
};

/**
 * Deletion refuses while the image is still on a product.
 *
 * The alternative — deleting anyway — leaves a product page with a broken image
 * and no indication of why. Reporting which products use it turns a dead end
 * into a next step.
 */
export const deleteMedia = async (id: string, force = false): Promise<void> => {
  const asset = await MediaModel.findById(id).lean();
  if (!asset) throw ApiError.notFound('No such image');

  const usedBy = await mediaUsage(id);
  if (usedBy.length > 0 && !force) {
    throw ApiError.conflict(
      `Still used by ${usedBy.length} product${usedBy.length === 1 ? '' : 's'}: ` +
        usedBy
          .slice(0, 3)
          .map((product) => product.name)
          .join(', '),
    );
  }

  if (force && usedBy.length > 0) {
    await ProductModel.updateMany(
      { 'colourways.images.mediaId': id },
      { $pull: { 'colourways.$[].images': { mediaId: id } } },
    );
  }

  if (asset.provider === 'local') await removeObject(asset.key);
  await MediaModel.deleteOne({ _id: id });
};
