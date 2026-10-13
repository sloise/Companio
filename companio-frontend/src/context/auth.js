import { createContext, useContext } from "react";

// The logged-in user, shared by every page. Filled in by <AuthProvider> (AuthContext.jsx).
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}
