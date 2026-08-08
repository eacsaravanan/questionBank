import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** Wrap a route element: requires login, optionally requires one of `roles`. */
export default function RoleGuard({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;

  // A password that was force-reset (admin-assisted reset, or a
  // just-created temp-password account) must be changed before the user
  // can do anything else — the login response already carries this flag,
  // it just wasn't being acted on anywhere. /profile is always allowed
  // through so there's somewhere to actually change it.
  if (user.mustResetPassword && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace state={{ forcePasswordChange: true }} />;
  }

  if (roles && !roles.some((r) => user.roles?.includes(r))) {
    return <Navigate to="/" replace />;
  }
  return children;
}
