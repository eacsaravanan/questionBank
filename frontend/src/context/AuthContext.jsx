import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function login(username, password, otp) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/login', { username, password, otp });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (err) {
      if (err.response?.data?.error === 'MFA_REQUIRED') {
        setError('MFA_REQUIRED');
      } else {
        setError(err.response?.data?.message || 'Login failed. Check your credentials.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') });
    } catch (e) { /* best-effort */ }
    localStorage.clear();
    setUser(null);
  }

  function hasPermission(code) {
    return !!user?.permissions?.includes(code) || !!user?.permissions?.includes('*');
  }

  function hasRole(name) {
    return !!user?.roles?.includes(name);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, hasPermission, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
