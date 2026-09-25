import { useEffect, useState } from 'react';
import type { AuthUser } from '../auth/AuthTypes';
import { isPawosAdminEmail } from '../../shared/admin/AdminEmails';
import { adminService } from './AdminService';

/**
 * Whether to show admin UI for the signed-in account. The built-in PawOS admin emails show it
 * immediately; any other signed-in account is shown it only if the server's `pawos_admins` list
 * includes it (so admins added from the console see it too). Never guests.
 * Visibility only — every admin action is re-authorized server-side.
 */
export function useIsBuildAdmin(user: AuthUser): boolean {
  const builtIn = !user.isGuest && isPawosAdminEmail(user.email);
  const [serverAdmin, setServerAdmin] = useState(false);

  useEffect(() => {
    setServerAdmin(false);
    if (user.isGuest || builtIn || !user.email) return;
    let alive = true;
    adminService.isAdmin().then((result) => {
      if (alive) setServerAdmin(result);
    });
    return () => {
      alive = false;
    };
  }, [user.id, user.email, user.isGuest, builtIn]);

  return builtIn || serverAdmin;
}
