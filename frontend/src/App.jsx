import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Loading } from "./components/States.jsx";
import { guestSession } from "./lib/guest";
import Board from "./pages/Board.jsx";
import Boards from "./pages/Boards.jsx";
import Join from "./pages/Join.jsx";
import Login from "./pages/Login.jsx";
import { useSession } from "./session.jsx";

function Guard({ children }) {
  const { user } = useSession();
  return user ? children : <Navigate to="/login" replace />;
}

function BoardGuard({ children }) {
  const { user } = useSession();
  const { id } = useParams();
  return user || guestSession(id) ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, loading } = useSession();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/s/:token" element={<Join />} />
      <Route path="/" element={<Guard><Boards /></Guard>} />
      <Route path="/boards/:id" element={<BoardGuard><Board /></BoardGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
