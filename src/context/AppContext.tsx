import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { readLocal, writeLocal, deleteLocal } from '../localStore';

const SESSION_KEY = 'mesh_session_user'
const SESSION_FILE = 'session.json'

function loadSessionSync(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch (_e) { return null }
}

interface AppContextType {
  user: User | null;
  setUser: (u: User | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, _setUser] = useState<User | null>(() => loadSessionSync());

  useEffect(() => {
    readLocal<User>(SESSION_FILE).then((stored) => {
      if (stored && stored.username) {
        _setUser(stored)
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(stored)) } catch (e) {}
      }
    })
  }, [])

  const setUser = useCallback((u: User | null) => {
    _setUser(u)
    if (u) {
      writeLocal(SESSION_FILE, u)
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)) } catch (e) {}
    } else {
      deleteLocal(SESSION_FILE)
      try { localStorage.removeItem(SESSION_KEY) } catch (e) {}
    }
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
