// src/lib/useAdmin.ts
// Custom hook to check admin authentication status
// Uses cookie-based server-side session (secure) + localStorage (fast UI updates)

'use client';
import { useState, useEffect, useCallback } from 'react';

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdmin = useCallback(async () => {
    try {
      // First check the server session via cookie (the real auth)
      const res = await fetch('/api/auth');
      const data = await res.json();
      const adminStatus = data.admin === true;

      setIsAdmin(adminStatus);
      // Sync localStorage with real auth status
      if (adminStatus) {
        localStorage.setItem('isAdmin', 'true');
      } else {
        localStorage.removeItem('isAdmin');
      }
    } catch {
      // Fallback to localStorage if API is unavailable
      setIsAdmin(localStorage.getItem('isAdmin') === 'true');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  return { isAdmin, loading, checkAdmin };
}
