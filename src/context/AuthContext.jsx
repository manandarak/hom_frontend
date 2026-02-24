import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // <-- ADDED LOADING STATE

  useEffect(() => {
    // Re-hydrate user state on page load
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("access_token");

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      axios.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
    }

    setLoading(false); // <-- TELL APP WE ARE DONE CHECKING AUTH
  }, []);

  const login = async (username, password) => {
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      const response = await axios.post("http://localhost:8000/api/v1/auth/login", formData);

      // Capture the new payload structure
      const { access_token, user: userData } = response.data;

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("user", JSON.stringify(userData)); // Store role/permissions

      setUser(userData);
      axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;

      // Use window.location to redirect without needing Router Context
      window.location.href = "/";
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];

    // Redirect to login page cleanly
    window.location.href = "/login";
  };

  return (
    // <-- EXPORT LOADING SO APP.JSX CAN USE IT
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};