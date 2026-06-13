import React, { createContext, useContext, useState, useEffect } from 'react';

type Role = 'admin' | null;

interface AuthContextType {
  role: Role;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  role: null,
  login: async () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

// SHA-256 hash of the admin password. The plaintext is intentionally NOT stored
// in the repo. To change the password: run
//   printf 'YOUR_NEW_PASSWORD' | sha256sum
// and paste the hash here (or set VITE_ADMIN_PASS_HASH in Vercel env vars).
//
// Note: this is a static client-side app, so this gates the admin UI on the
// public site — it is not server-grade security. Real mutations still require
// the GitHub PAT entered separately at runtime.
const DEFAULT_ADMIN_HASH = '1e688aa56f9585b6039975deedde577e825725bc2a15785517de04f8d884d9f8';
const ADMIN_HASH = (import.meta.env.VITE_ADMIN_PASS_HASH as string | undefined)?.trim() || DEFAULT_ADMIN_HASH;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>(null);

  useEffect(() => {
    const saved = localStorage.getItem('app_auth_role') as Role;
    if (saved === 'admin') {
      setRole(saved);
    } else {
      localStorage.removeItem('app_auth_role');
    }
  }, []);

  const login = async (password: string): Promise<boolean> => {
    try {
      const hash = await sha256Hex(password);
      if (hash === ADMIN_HASH) {
        setRole('admin');
        localStorage.setItem('app_auth_role', 'admin');
        return true;
      }
    } catch {
      /* crypto unavailable — fail closed */
    }
    return false;
  };

  const logout = () => {
    setRole(null);
    localStorage.removeItem('app_auth_role');
    localStorage.removeItem('gh_pat');
  };

  return (
    <AuthContext.Provider value={{ role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
