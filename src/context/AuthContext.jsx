import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../api'; // Make sure your API import is here

// 1. Context created WITHOUT 'export'
const AuthContext = createContext();

// 2. The Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Must have loading state for App.jsx

  // This is where your actual token checking logic goes
  useEffect(() => {
    const checkUser = async () => {
      try {
        // Example: Check local storage or ping backend to verify session
        const token = localStorage.getItem('token');
        if (token) {
          const res = await api.get('/users/me'); // Replace with your actual endpoint
          setUser(res.data);
        }
      } catch (error) {
        console.error("Auth check failed", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, []);

  const login = async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    const res = await api.post('/auth/login', formData);
    const token = res.data.access_token || res.data.token;
    localStorage.setItem('token', token);
    setUser(res.data.user || { username: username });
  };

  // Your logout function
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  // 3. You MUST pass user, loading, login, and logout in the value prop!
  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// 4. The Custom Hook
export const useAuth = () => {
  return useContext(AuthContext);
};