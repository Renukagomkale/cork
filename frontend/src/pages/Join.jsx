import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { errorMessages } from "../api";
import { ErrorList, Loading } from "../components/States.jsx";
import { saveGuest } from "../lib/guest";
import { useSession } from "../session.jsx";

const roleText = { view: "view the board", edit: "view and edit the board" };

export default function Join() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/share/${token}`)
      .then(async ({ data }) => {
        if (user) {
          const isOwner = await api.get(`/boards/${data.board.id}`).then(() => true, () => false);
          if (isOwner) return navigate(`/boards/${data.board.id}`, { replace: true });
        }
        setInvite(data);
      })
      .catch((error) => setLoadError(errorMessages(error)[0]));
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const { data } = await api.post(`/share/${token}/join`, { name });
      saveGuest(data.board.id, { token: data.token, id: data.guest.id, name: data.guest.name, role: data.role });
      navigate(`/boards/${data.board.id}`, { replace: true });
    } catch (error) {
      setErrors(errorMessages(error));
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <main className="grid h-full place-items-center px-4 text-center">
        <div>
          <p className="text-xl font-semibold">{loadError}</p>
          <p className="mt-2 text-sm opacity-70">Ask the owner of the board for a new link.</p>
        </div>
      </main>
    );
  }
  if (!invite) return <Loading label="Checking your link" />;

  return (
    <main className="grid h-full place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rotate-1 space-y-4 rounded-[4px] bg-paper p-7 shadow-[0_18px_30px_-16px_rgb(35_38_43/0.55)]">
        <p className="text-sm font-medium opacity-70">You are invited to</p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{invite.board.title}</h1>
        <p className="text-sm">You will be able to {roleText[invite.role]}. No account needed.</p>
        <label className="block text-sm font-medium">
          Your name
          <input
            required
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-ink/30 bg-white px-3 py-2.5"
          />
        </label>
        <ErrorList messages={errors} />
        <button disabled={busy} className="chip bg-cobalt text-paper hover:!bg-cobalt">
          {busy ? "One moment" : "Open the board"}
        </button>
      </form>
    </main>
  );
}
