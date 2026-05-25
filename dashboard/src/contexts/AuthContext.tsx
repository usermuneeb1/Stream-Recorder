import React, { createContext, useContext, useState, useEffect } from 'react';

type Role = 'admin' | 'viewer' | null;

interface AuthContextType {
  role: Role;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  role: null,
  login: () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>(null);

  useEffect(() => {
    const saved = localStorage.getItem('app_auth_role') as Role;
    if (saved === 'admin' || saved === 'viewer') {
      setRole(saved);
    }
  }, []);

  const login = (password: string) => {
    if (password === 'd3xture1') {
      setRole('admin');
      localStorage.setItem('app_auth_role', 'admin');
      return true;
    } else if (password === 'd3xture2') {
      setRole('viewer');
      localStorage.setItem('app_auth_role', 'viewer');
      return true;
    }
    return false;
  };

  const logout = () => {
    setRole(null);
    localStorage.removeItem('app_auth_role');
  };

  return (
    <AuthContext.Provider value={{ role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
