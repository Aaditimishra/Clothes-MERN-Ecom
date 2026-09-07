import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { ApiError } from '../../lib/api-error';

/**
 * Uploads are written to the local filesystem.
 *
 * The development default, and a perfectly reasonable production choice for a
 * single server with a backed-up disk. Everything else in this module talks to
 * `put`/`remove`/`publicUrl`, so an S3 or Cloudinary adapter drops in beside this
 * one without a single caller changing.
 */
export const STORAGE_ROOT = resolve(process.cwd(), '.uploads');

/** Where the static middleware mounts the directory above. */
export const PUBLIC_PREFIX = '/uploads';

/**
 * Refuses to write outside the storage root.
 *
 * A key is derived from a user-supplied filename, so `../../etc/passwd` is a
 * request that will arrive eventually. Resolving and then checking the prefix is
 * the check that actually holds — string matching on `..` does not, because
 * encodings and symlinks get around it.
 */
const resolveWithinRoot = (key: string): string => {
  const target = resolve(STORAGE_ROOT, key);
  if (target !== STORAGE_ROOT && !target.startsWith(STORAGE_ROOT + sep)) {
    throw ApiError.badRequest('Invalid storage key');
  }
  return target;
};

export const putObject = async (key: string, body: Buffer): Promise<void> => {
  const target = resolveWithinRoot(key);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
};

export const removeObject = async (key: string): Promise<void> => {
  try {
    await rm(resolveWithinRoot(key), { force: true });
  } catch (error) {
    // A file that will not delete must not fail the request that removed the
    // record. It becomes an orphan on disk, which is a cleanup job's problem
    // rather than the merchant's.
    console.warn(`[media] could not delete '${key}'`, error);
  }
};

/**
 * Turns a stored key into something an `<img src>` can use.
 *
 * External assets — the stock photography the demo ships with — store their full
 * URL as the key. Treating them as first-class media is what lets the admin list,
 * caption and replace them alongside anything uploaded later.
 */
export const publicUrl = (key: string): string =>
  /^https?:\/\//.test(key) ? key : `${PUBLIC_PREFIX}/${key.split(sep).join('/')}`;

export const monthlyPrefix = (): string => {
  const now = new Date();
  return join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
};
