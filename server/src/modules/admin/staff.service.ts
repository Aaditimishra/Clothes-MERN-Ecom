import bcrypt from 'bcryptjs';
import { paginate, type Page, type PageQuery } from '../../lib/paginate';
import jwt from 'jsonwebtoken';
import { newId } from '@shop/shared';

import { env } from '../../config/env';
import { ApiError } from '../../lib/api-error';
import {
  PERMISSIONS,
  ROLE_PRESETS,
  StaffModel,
  type Permission,
  type StaffDoc,
} from '../../models/staff.model';

const BCRYPT_ROUNDS = 12;

/**
 * Staff tokens carry an audience claim, and it is verified.
 *
 * Without it, a customer's token would satisfy the admin middleware's signature
 * check — the secret is the same — and any shopper could call an admin endpoint
 * by pointing their existing token at it. The audience is what makes the two
 * token families genuinely separate.
 */
const STAFF_AUDIENCE = 'threadline:admin';

export interface StaffView {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export const toStaffView = (doc: StaffDoc): StaffView => ({
  id: doc._id,
  email: doc.email,
  name: doc.name,
  role: doc.role,
  permissions: doc.permissions as Permission[],
  isActive: doc.isActive ?? true,
  lastLoginAt: doc.lastLoginAt?.toISOString() ?? null,
});

export const issueStaffToken = (staffId: string): string =>
  jwt.sign({ sub: staffId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    audience: STAFF_AUDIENCE,
  } as jwt.SignOptions);

export const readStaffToken = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { audience: STAFF_AUDIENCE });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

export const signInStaff = async (
  email: string,
  password: string,
): Promise<{ token: string; staff: StaffView }> => {
  const staff = await StaffModel.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash')
    .exec();

  // One message for "no such user", "wrong password" and "deactivated". Telling
  // an attacker which of the three they hit turns the login form into a directory
  // of who works here.
  const invalid = ApiError.unauthorized('Email or password is incorrect');

  if (!staff || !staff.isActive) {
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }

  if (!(await bcrypt.compare(password, staff.passwordHash))) throw invalid;

  staff.lastLoginAt = new Date();
  await staff.save();

  return { token: issueStaffToken(staff._id), staff: toStaffView(staff.toObject()) };
};

export const findStaff = async (id: string): Promise<StaffView> => {
  const staff = await StaffModel.findById(id).lean();
  if (!staff || !staff.isActive) throw ApiError.unauthorized('Your session is no longer valid');
  return toStaffView(staff);
};

export const listStaff = async (query: PageQuery): Promise<Page<StaffView>> =>
  paginate(StaffModel, {
    // `_id` breaks the tie, so two people with the same name keep a stable
    // order between pages instead of one appearing twice and another never.
    sort: { name: 1, _id: 1 },
    query,
    map: toStaffView,
  });

export interface CreateStaffInput {
  email: string;
  password: string;
  name: string;
  role: string;
  permissions?: Permission[];
}

export const createStaff = async (input: CreateStaffInput): Promise<StaffView> => {
  const email = input.email.toLowerCase().trim();
  if (await StaffModel.exists({ email })) {
    throw ApiError.conflict('That email already has an account', { email: 'Already in use' });
  }

  // An unknown role grants nothing rather than everything. The failure mode of
  // a typo should be "cannot do anything", never "can do everything".
  const permissions = input.permissions ?? ROLE_PRESETS[input.role] ?? [];

  const created = await StaffModel.create({
    _id: newId('stf'),
    email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    name: input.name.trim(),
    role: input.role,
    permissions,
    isActive: true,
  });

  return toStaffView(created.toObject());
};

export const updateStaff = async (
  id: string,
  patch: { name?: string; role?: string; permissions?: Permission[]; isActive?: boolean },
): Promise<StaffView> => {
  /**
   * Changing the role RE-APPLIES that role's preset.
   *
   * Without this the label moved and the access did not: promoting someone from
   * support to operations renamed their role and left them with exactly the
   * permissions they had before, so the dropdown was telling the owner something
   * that had not happened. An explicit `permissions` list still wins, which is
   * how a role gets customised for one person.
   */
  const permissions =
    patch.permissions ??
    (patch.role !== undefined ? ROLE_PRESETS[patch.role] : undefined);

  if (patch.role !== undefined && permissions === undefined) {
    throw ApiError.badRequest(`'${patch.role}' is not a known role`, { role: 'Unknown role' });
  }

  const updated = await StaffModel.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('No such staff user');
  return toStaffView(updated);
};

export const changeStaffPassword = async (id: string, password: string): Promise<void> => {
  const result = await StaffModel.updateOne(
    { _id: id },
    { $set: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) } },
  );

  if (result.matchedCount === 0) throw ApiError.notFound('No such staff user');
};

/**
 * A staff member editing their OWN record.
 *
 * Separate from `updateStaff` on purpose: this one cannot touch the role, the
 * permission list or the active flag. Letting someone edit their own row through
 * the same function that grants permissions is how a support account becomes an
 * owner.
 */
export const updateOwnProfile = async (
  id: string,
  patch: { name: string },
): Promise<StaffView> => {
  const updated = await StaffModel.findByIdAndUpdate(
    id,
    { $set: { name: patch.name.trim() } },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.unauthorized('Your session is no longer valid');
  return toStaffView(updated);
};

export const changeOwnPassword = async (
  id: string,
  currentPassword: string,
  nextPassword: string,
): Promise<void> => {
  const staff = await StaffModel.findById(id).select('+passwordHash').exec();
  if (!staff) throw ApiError.unauthorized('Your session is no longer valid');

  // The current password is required even though the session is valid — a
  // borrowed laptop should not be enough to lock the owner out of their own
  // account.
  if (!(await bcrypt.compare(currentPassword, staff.passwordHash))) {
    throw ApiError.badRequest('That is not your current password', {
      currentPassword: 'Incorrect',
    });
  }

  staff.passwordHash = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
  await staff.save();
};

export const ALL_PERMISSIONS = PERMISSIONS;
export const ROLE_NAMES = Object.keys(ROLE_PRESETS);
