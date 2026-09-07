import type { Request, RequestHandler } from 'express';

import { ApiError } from '../lib/api-error';
import type { Permission } from '../models/staff.model';
import { findStaff, readStaffToken, type StaffView } from '../modules/admin/staff.service';

/**
 * Loads the staff user on every admin request.
 *
 * The permission list is read from the DATABASE, not from the token. A token
 * carrying its own permissions would keep working after an owner revoked them —
 * for the whole seven-day lifetime of that token. One extra indexed read per
 * admin request is a fair price for revocation that takes effect immediately.
 */
export const requireStaff: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const staffId = token ? readStaffToken(token) : null;

  if (!staffId) {
    next(ApiError.unauthorized('Sign in to the admin to continue'));
    return;
  }

  findStaff(staffId)
    .then((staff) => {
      req.staff = staff;
      next();
    })
    .catch(next);
};

export const staffOf = (req: Request): StaffView => {
  if (!req.staff) throw ApiError.unauthorized('Sign in to the admin to continue');
  return req.staff;
};

/**
 * Gates a route on one or more permissions — ALL of which are required.
 *
 * The `and` case is what keeps bulk export separate from ordinary viewing: an
 * export route asks for both the resource permission and `data.export`, so
 * holding one without the other is not enough.
 */
export const requirePermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    const staff = req.staff;

    if (!staff) {
      next(ApiError.unauthorized('Sign in to the admin to continue'));
      return;
    }

    const missing = permissions.find(
      (permission) => !staff.permissions.includes(permission),
    );

    if (missing) {
      // Names the missing permission. An admin told only "forbidden" has to
      // guess; told which permission is missing, they can ask for exactly that.
      next(ApiError.forbidden(`This action needs the '${missing}' permission`));
      return;
    }

    next();
  };
