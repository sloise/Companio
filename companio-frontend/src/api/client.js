import axios from "axios";

// One Axios instance for the whole app.
// The Laravel API address comes from .env (VITE_API_URL).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api",
  headers: { Accept: "application/json" },
  timeout: 15000, // give up after 15 seconds instead of loading forever
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
  // no answer at all: the server (or the database behind it) is down or too slow
  if (!error.response) {
    return "Can't reach the server. Check that Laravel (php artisan serve) and MySQL are running, then try again.";
  }

  const data = error.response.data;

  if (data?.errors) {
    return Object.values(data.errors).flat().join("\n");
  }

  if (error.response.status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }

  if (error.response.status >= 500) {
    return "The server had a problem. If this keeps happening, check that MySQL is running.";
  }

  return data?.message || "Something went wrong. Please try again.";
}

export default api;
