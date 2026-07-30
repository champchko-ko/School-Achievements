// src/lib/useAdmin.ts
// Custom hook to check admin authentication status
// Uses cookie-based server-side session with idle timeout

'use client';
import { useState, useEffect, useCallback } from 'react';

const CHECK_INTERVAL = 2 * 60 * 1000; // Check session every 2 minutes

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdmin = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      const adminStatus = data.admin === true;

      setIsAdmin(adminStatus);
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
    // Periodically check session to detect idle timeout
    const interval = setInterval(checkAdmin, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkAdmin]);

  return { isAdmin, loading, checkAdmin };
}
