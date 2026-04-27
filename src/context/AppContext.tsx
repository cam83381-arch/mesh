import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';

const SESSION_KEY = 'mesh_session_user'

function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch { return null }
}

interface AppContextType {
  user: User | null;
  setUser: (u: User | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, _setUser] = useState<User | null>(() => loadSession());

  const setUser = useCallback((u: User | null) => {
    _setUser(u)
    try {
      if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u))
      else localStorage.removeItem(SESSION_KEY)
    } catch {}
  }, [])

  return (
    <AppContext.Provider value={{ user, setUser }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
