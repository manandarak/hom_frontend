import React, { createContext, useState, useEffect } from "react";
// 1. IMPORT YOUR CUSTOM API INSTANCE INSTEAD OF RAW AXIOS
import api from "../api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Re-hydrate user state on page load
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("access_token");

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      // 2. APPLY TOKEN TO YOUR CUSTOM API INSTANCE
      api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
    }

    setLoading(false); // Tell app we are done checking auth
  }, []);

  const login = async (username, password) => {
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      // 3. USE YOUR API INSTANCE & RELATIVE PATH
      // This will automatically prefix whatever baseURL is inside src/api.js
      const response = await api.post("/auth/login", formData);

      // Capture the new payload structure
      const { access_token, user: userData } = response.data;

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("user", JSON.stringify(userData)); // Store role/permissions

      setUser(userData);
      // 4. APPLY NEW TOKEN TO YOUR CUSTOM API INSTANCE
      api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;

      // Navigation is handled by Login.jsx
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setUser(null);

    // 5. REMOVE TOKEN FROM YOUR CUSTOM API INSTANCE
    delete api.defaults.headers.common["Authorization"];

    // Navigation is handled by MainLayout.jsx
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};