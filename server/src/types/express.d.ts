import type { StaffView } from '../modules/admin/staff.service';

/**
 * Request augmentation.
 *
 * `customerId` is set by the shopper-facing middleware, `staff` by the admin
 * one. Declaring them here rather than casting at each use site means a handler
 * that forgets its middleware gets `undefined` from the type system instead of a
 * runtime surprise.
 *
 * A `declare global` block is the only way Express accepts an augmentation, so
 * the namespace rule is suppressed for this file alone rather than workspace-wide.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customerId?: string;
      staff?: StaffView;
    }
  }
}

export {};
