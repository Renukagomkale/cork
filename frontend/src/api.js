import axios from "axios";

const TOKEN_KEY = "cork.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api" });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = /\/auth\/(login|register)/.test(error.config?.url ?? "");
    if (error.response?.status === 401 && !isAuthCall) {
      clearToken();
      window.dispatchEvent(new Event("cork:logout"));
    }
    return Promise.reject(error);
  }
);

export function errorMessages(error) {
  const data = error.response?.data;
  if (!data) return ["Cannot reach the server. Check that the backend is running."];
  const fieldErrors = data.errors ? Object.values(data.errors).flat().map(String) : [];
  return fieldErrors.length ? fieldErrors : [data.message ?? "Something went wrong. Please try again."];
}

export default api;
