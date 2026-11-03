import { createContext, useContext, useEffect, useState } from "react";
import api, { clearToken, getToken, saveToken } from "./api";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (getToken()) {
      api
        .get("/auth/me")
        .then((response) => setUser(response.data.user))
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    }
    const onLogout = () => setUser(null);
    window.addEventListener("cork:logout", onLogout);
    return () => window.removeEventListener("cork:logout", onLogout);
  }, []);

  const authenticate = async (path, body) => {
    const { data } = await api.post(path, body);
    saveToken(data.token);
    setUser(data.user);
  };

  const login = (email, password) => authenticate("/auth/login", { email, password });
  const register = (form) => authenticate("/auth/register", form);

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return <SessionContext.Provider value={{ user, loading, login, register, logout }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
