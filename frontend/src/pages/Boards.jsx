import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errorMessages } from "../api";
import { ErrorBox, ErrorList, Loading } from "../components/States.jsx";
import { useSession } from "../session.jsx";

const tints = ["sunflower", "sage", "tomato", "cobalt"];
const PAGE_SIZE = 12;

export default function Boards() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const [state, setState] = useState({ boards: [], total: 0, page: 0, loading: true, error: null });
  const [actionErrors, setActionErrors] = useState([]);

  const load = async (page) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const { data } = await api.get("/boards", { params: { page, limit: PAGE_SIZE } });
      setState((current) => ({
        boards: page === 1 ? data.boards : [...current.boards, ...data.boards],
        total: data.total,
        page,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const create = async () => {
    setActionErrors([]);
    try {
      const { data } = await api.post("/boards", {});
      navigate(`/boards/${data.board.id}`);
    } catch (error) {
      setActionErrors(errorMessages(error));
    }
  };

  const remove = async (board) => {
    if (!window.confirm(`Delete "${board.title}" and everything on it?`)) return;
    setActionErrors([]);
    try {
      await api.delete(`/boards/${board.id}`);
      setState((current) => ({ ...current, boards: current.boards.filter((b) => b.id !== board.id), total: current.total - 1 }));
    } catch (error) {
      setActionErrors(errorMessages(error));
    }
  };

  const { boards, total, loading, error } = state;

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <p className="text-2xl font-bold tracking-tight">Cork</p>
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">{user.name}</span>
          <button onClick={logout} className="chip">Sign out</button>
        </div>
      </header>

      <div className="flex items-end justify-between">
        <h1 className="text-4xl font-bold tracking-tight">Your boards</h1>
        <button onClick={create} className="chip bg-cobalt text-paper hover:!bg-cobalt">
          <Plus size={18} /> New board
        </button>
      </div>

      <div className="mt-4">
        <ErrorList messages={actionErrors} />
      </div>
      {error && <ErrorBox error={error} onRetry={() => load(state.page || 1)} />}
      {loading && boards.length === 0 && <Loading label="Loading your boards" />}
      {!loading && !error && boards.length === 0 && (
        <p className="mt-10 max-w-sm text-lg">Nothing here yet. Start a board and pin your first note.</p>
      )}

      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board, index) => (
          <li key={board.id} className="group relative" style={{ transform: `rotate(${[-1.5, 1, -0.5, 1.5][index % 4]}deg)` }}>
            <Link
              to={`/boards/${board.id}`}
              className="block h-40 rounded-[3px] p-4 shadow-[0_5px_10px_-6px_rgb(35_38_43/0.45)] transition-transform duration-150 group-hover:-translate-y-1"
              style={{ background: `var(--color-${tints[index % 4]})`, color: index % 4 > 1 ? "var(--color-paper)" : "var(--color-ink)" }}
            >
              <p className="text-xl font-semibold leading-tight">{board.title}</p>
              <p className="mt-2 text-sm opacity-80">Edited {new Date(board.updatedAt).toLocaleDateString()}</p>
            </Link>
            <button
              onClick={() => remove(board)}
              aria-label={`Delete ${board.title}`}
              className="chip absolute bottom-2 right-2 bg-paper/80 text-ink opacity-0 focus:opacity-100 group-hover:opacity-100"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {boards.length < total && (
        <button onClick={() => load(state.page + 1)} disabled={loading} className="chip mt-8 bg-ink/10">
          Show more boards
        </button>
      )}
    </div>
  );
}
