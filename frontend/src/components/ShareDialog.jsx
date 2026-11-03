import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import api, { errorMessages } from "../api";
import { ErrorList } from "./States.jsx";

const field = "mt-1 w-full rounded-xl border border-ink/30 bg-white px-3 py-2";
const roleLabel = { view: "Can view", edit: "Can edit" };

export default function ShareDialog({ boardId, onClose }) {
  const [links, setLinks] = useState(null);
  const [role, setRole] = useState("view");
  const [days, setDays] = useState("");
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState([]);

  const load = () =>
    api
      .get(`/boards/${boardId}/share`)
      .then((response) => setLinks(response.data.links))
      .catch((error) => setErrors(errorMessages(error)));

  useEffect(() => {
    load();
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const create = async () => {
    setErrors([]);
    setCopied(false);
    try {
      const { data } = await api.post(`/boards/${boardId}/share`, { role, ...(days && { expiresInDays: Number(days) }) });
      setCreated(`${window.location.origin}/s/${data.token}`);
      load();
    } catch (error) {
      setErrors(errorMessages(error));
    }
  };

  const revoke = async (link) => {
    if (!window.confirm("Stop sharing with this link? Anyone using it is removed right away.")) return;
    try {
      await api.delete(`/boards/${boardId}/share/${link.id}`);
      load();
    } catch (error) {
      setErrors(errorMessages(error));
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(created);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share this board"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto rounded-2xl bg-paper p-6"
      >
        <h2 className="text-2xl font-bold tracking-tight">Share this board</h2>

        <div className="grid grid-cols-2 gap-3 text-sm font-medium">
          <label>
            Access
            <select value={role} onChange={(event) => setRole(event.target.value)} className={field}>
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
          </label>
          <label>
            Expires
            <select value={days} onChange={(event) => setDays(event.target.value)} className={field}>
              <option value="">Never</option>
              <option value="1">In 1 day</option>
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
            </select>
          </label>
        </div>
        <button onClick={create} className="chip bg-cobalt text-paper hover:!bg-cobalt">
          Create link
        </button>

        {created && (
          <div className="rounded-xl bg-sunflower/40 p-3 text-sm">
            <p className="font-medium">Copy it now. For safety it is not shown again.</p>
            <p className="mt-2 break-all font-mono text-xs">{created}</p>
            <button onClick={copy} className="chip mt-2 bg-paper">
              <Copy size={16} /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}

        <ErrorList messages={errors} />

        <div>
          <h3 className="font-semibold">Active links</h3>
          {links && links.length === 0 && <p className="mt-2 text-sm opacity-70">No links yet. Only you can open this board.</p>}
          <ul className="mt-2 divide-y divide-ink/15">
            {(links ?? []).map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{roleLabel[link.role]}</span>
                  <span className="block text-xs opacity-70">
                    {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}` : "Never expires"}
                  </span>
                </span>
                <button onClick={() => revoke(link)} className="chip">
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button onClick={onClose} className="chip bg-ink/10">
          Done
        </button>
      </div>
    </div>
  );
}
