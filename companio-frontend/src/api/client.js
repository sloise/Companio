import axios from "axios";

// One Axios instance for the whole app.
// The Laravel API address comes from .env (VITE_API_URL).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api",
  headers: { Accept: "application/json" },
});

// Attach the login token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// If the token is no longer valid, go back to the login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// Turns a Laravel error response into text we can show in an alert
export function errorMessage(error) {
  const data = error.response?.data;

  if (data?.errors) {
    return Object.values(data.errors).flat().join("\n");
  }

  return data?.message || "Something went wrong. Is the Laravel server running?";
}

export default api;
