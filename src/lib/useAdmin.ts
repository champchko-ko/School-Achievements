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
      // Fail closed on error (MUST-08)
      setIsAdmin(false);
      localStorage.removeItem('isAdmin');
    } finally {

      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer the initial check out of the synchronous effect body so React does
    // not treat it as a setState-during-commit (react-hooks/set-state-in-effect).
    const kickoff = setTimeout(() => { void checkAdmin(); }, 0);
    // Periodically check session to detect idle timeout
    const interval = setInterval(checkAdmin, CHECK_INTERVAL);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [checkAdmin]);

  return { isAdmin, loading, checkAdmin };
}
