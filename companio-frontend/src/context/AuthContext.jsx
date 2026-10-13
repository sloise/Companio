import { createContext, useContext, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSavedUser);

  // keep the token and user in the browser so a refresh does not log us out
  const saveSession = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  // LOGIN
  const login = async (email, password) => {
    const response = await api.post("/login", { email, password });
    return saveSession(response.data);
  };

  // REGISTER - volunteers are logged in right away.
  // Shelter staff requests come back with "pending" and no token (an admin must approve them first).
  const register = async (form) => {
    const response = await api.post("/register", form);

    if (response.data.pending) {
      return response.data;
    }

    return saveSession(response.data);
  };

  // LOGOUT
  const logout = async () => {
    try {
      await api.post("/logout");
    } catch {
      // the token may already be invalid - we still log out locally
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const value = { user, isAdmin: user?.role === "admin", login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
