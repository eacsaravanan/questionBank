/**
 * Dynamic RBAC. Permissions are DATA (see Role/Permission models), not
 * hardcoded enums, so Super Admin can create new roles/permissions from
 * the UI at any time without a code change or redeploy. This middleware
 * just checks whether the JWT's permission-code list (computed at login
 * from the user's current roles) contains what the route requires.
 *
 * Usage: router.post('/questions', authenticate, requirePermission('question.create'), handler)
 */
export function requirePermission(...requiredCodes) {
  return (req, res, next) => {
    const userPerms = new Set(req.user?.permissions || []);
    const ok = requiredCodes.every((code) => userPerms.has(code) || userPerms.has('*'));
    if (!ok) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Missing required permission(s): ${requiredCodes.join(', ')}`,
      });
    }
    next();
  };
}

/** Require at least one of the given permission codes. */
export function requireAnyPermission(...anyCodes) {
  return (req, res, next) => {
    const userPerms = new Set(req.user?.permissions || []);
    const ok = anyCodes.some((code) => userPerms.has(code)) || userPerms.has('*');
    if (!ok) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireRole(...roleNames) {
  return (req, res, next) => {
    const userRoles = new Set(req.user?.roles || []);
    const ok = roleNames.some((r) => userRoles.has(r));
    if (!ok) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Role not authorized for this action' });
    }
    next();
  };
}
