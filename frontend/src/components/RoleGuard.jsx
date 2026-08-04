import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** Wrap a route element: requires login, optionally requires one of `roles`. */
export default function RoleGuard({ roles, children }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.some((r) => user.roles?.includes(r))) {
    return <Navigate to="/" replace />;
  }
  return children;
}
