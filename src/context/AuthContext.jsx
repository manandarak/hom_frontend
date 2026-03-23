import { createContext, useState, useContext } from 'react';

// 1. Remove the 'export' keyword from the context creation
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // ... your existing auth logic

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
};

// 2. Export a custom hook instead
export const useAuth = () => {
  return useContext(AuthContext);
};