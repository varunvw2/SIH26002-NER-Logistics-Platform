import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authApi, setUnauthorizedHandler } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [language, setLanguageState] = useState(localStorage.getItem('sih_lang') || 'en');
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem('sih_token');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('sih_token');
    if (!token) { setReady(true); return; }
    authApi.me(token)
      .then(({ user: u }) => { setUser(u); if (u.language) setLanguageState(u.language); })
      .catch(() => logout())
      .finally(() => setReady(true));
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await authApi.login(email, password);
    localStorage.setItem('sih_token', token);
    setUser(u);
    if (u.language) setLanguageState(u.language);
    return u;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: u } = await authApi.register(payload);
    localStorage.setItem('sih_token', token);
    setUser(u);
    return u;
  }, []);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    localStorage.setItem('sih_lang', lang);
  }, []);

  const value = useMemo(() => ({ user, login, register, logout, language, setLanguage, ready }), [user, login, register, logout, language, setLanguage, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
