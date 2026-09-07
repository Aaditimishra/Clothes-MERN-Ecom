import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useSession } from '../lib/session';

/**
 * Guards a route on a permission.
 *
 * Hiding the sidebar link is not enough: a typed URL, a bookmark or a link
 * pasted by a colleague all reach the route directly. Without this the page
 * still mounted, its data request came back 403, and the screen sat on a loading
 * skeleton forever — the data was safe, but the person was left staring at grey
 * bars with nothing to tell them why.
 *
 * The message names the missing permission on purpose. "Forbidden" leaves
 * someone guessing; naming it lets them ask an owner for exactly that.
 */
export const RequirePermission = ({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) => {
  const { can, session } = useSession();

  if (can(permission)) return <>{children}</>;

  return (
    <>
      <header className="topbar">
        <h1>No access</h1>
      </header>

      <div className="page">
        <section className="card">
          <div className="empty">
            <strong>This section needs a permission you do not have</strong>
            <p className="muted">
              Your account ({session?.staff.role}) is missing{' '}
              <code className="mono">{permission}</code>. An owner can grant it from
              Staff.
            </p>
            <Link to="/" className="btn btn-primary">
              Back to the dashboard
            </Link>
          </div>
        </section>
      </div>
    </>
  );
};
