import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  authenticateUser,
  createInitialAdmin,
  getUserCount,
  type AppUser,
} from '../lib/database';

type AuthStatus = 'loading' | 'setup' | 'signedOut' | 'signedIn' | 'error';
type AuthContextValue = {
  status: AuthStatus;
  user: AppUser | null;
  error: string | null;
  setupAdmin: (input: { name: string; username: string; pin: string }) => Promise<void>;
  signIn: (username: string, pin: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const userCount = await getUserCount(db);
        if (cancelled) return;
        if (userCount === 0) {
          setStatus('setup');
          return;
        }
        setStatus('signedOut');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Unable to open local user data.');
        setStatus('error');
      }
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const setupAdmin = useCallback(async (input: { name: string; username: string; pin: string }) => {
    const createdUser = await createInitialAdmin(db, input);
    setUser(createdUser);
    setError(null);
    setStatus('signedIn');
  }, [db]);

  const signIn = useCallback(async (username: string, pin: string) => {
    const authenticatedUser = await authenticateUser(db, username, pin);
    if (!authenticatedUser) return false;
    setUser(authenticatedUser);
    setError(null);
    setStatus('signedIn');
    return true;
  }, [db]);

  const signOut = useCallback(async () => {
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({ status, user, error, setupAdmin, signIn, signOut }),
    [status, user, error, setupAdmin, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be rendered inside AuthProvider.');
  return value;
}
