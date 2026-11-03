import { ArrowLeft, Link2, Minus, Palette, Plus, Redo2, StickyNote, Undo2 } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api";
import Cursors from "../components/Cursors.jsx";
import ItemView from "../components/ItemView.jsx";
import ShareDialog from "../components/ShareDialog.jsx";
import { Loading } from "../components/States.jsx";
import { boardReducer, initialState, newId, opsFor } from "../lib/boardState";
import { guestSession } from "../lib/guest";
import useBoard from "../lib/useBoard";
import { useSession } from "../session.jsx";

const noteColors = ["sunflower", "sage", "tomato", "cobalt"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const DEFAULT_VIEW = { x: 90, y: 90, scale: 1 };

export default function Board() {
  const { id: boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const actingAs = guestSession(boardId);
  const meId = actingAs ? actingAs.id : user.id;
  const [state, dispatch] = useReducer(boardReducer, initialState);
  const live = useBoard(boardId, dispatch, () => navigate("/", { replace: true }));
  const { items } = state;
  const canEdit = live.status === "live" && live.role !== "view";

  const [view, setView] = useState(DEFAULT_VIEW);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [lifted, setLifted] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [sharing, setSharing] = useState(false);
  const surface = useRef(null);
  const drag = useRef(null);
  const lastSent = useRef(0);
  const viewRef = useRef(view);
  const itemsRef = useRef(items);
  const liveRef = useRef(live);
  viewRef.current = view;
  itemsRef.current = items;
  liveRef.current = live;

  const zoomAt = (cx, cy, factor) =>
    setView((current) => {
      const scale = clamp(current.scale * factor, 0.2, 3);
      const ratio = scale / current.scale;
      return { scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio };
    });

  useEffect(() => {
    const element = surface.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.01));
      } else {
        setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [live.ready]);

  const move = useCallback((event) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.sx;
    const dy = event.clientY - current.sy;
    const scale = viewRef.current.scale;
    if (current.kind === "pan") {
      setView((v) => ({ ...v, x: current.ox + dx, y: current.oy + dy }));
      return;
    }
    const patches = {};
    for (const id of current.ids) {
      const origin = current.origins[id];
      patches[id] =
        current.kind === "move"
          ? { x: origin.x + dx / scale, y: origin.y + dy / scale, layer: current.top }
          : { w: Math.max(80, origin.w + dx / scale), h: Math.max(70, origin.h + dy / scale) };
    }
    current.last = patches;
    dispatch({ type: "patch", patches });
    const now = Date.now();
    if (now - lastSent.current >= 70) {
      lastSent.current = now;
      liveRef.current.sendUpdates(current.ids.map((id) => ({ itemId: id, changes: patches[id] })));
    }
  }, []);

  const up = useCallback(
    function release() {
      const current = drag.current;
      drag.current = null;
      setLifted(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      if (!current || current.kind === "pan" || !current.last) return;
      const changes = current.ids.map((id) => ({ id, before: current.origins[id], after: current.last[id] }));
      dispatch({ type: "record", changes });
      liveRef.current.sendUpdates(changes.map((change) => ({ itemId: change.id, changes: change.after })));
    },
    [move]
  );

  const begin = (data) => {
    drag.current = data;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startPan = (event) => {
    if (event.target !== surface.current && !event.target.dataset.world) return;
    setSelected([]);
    begin({ kind: "pan", sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y });
  };

  const startMove = (event, item) => {
    event.stopPropagation();
    if (editing === item.id) return;
    const ids = selected.includes(item.id) ? selected : event.shiftKey ? [...selected, item.id] : [item.id];
    setSelected(ids);
    if (!canEdit) return;
    setLifted(true);
    const origins = Object.fromEntries(
      ids.map((id) => {
        const found = items.find((entry) => entry.id === id);
        return [id, { x: found.x, y: found.y, layer: found.layer }];
      })
    );
    begin({ kind: "move", sx: event.clientX, sy: event.clientY, ids, origins, top: Date.now() });
  };

  const startResize = (event, item) => {
    event.stopPropagation();
    if (!canEdit) return;
    begin({ kind: "resize", sx: event.clientX, sy: event.clientY, ids: [item.id], origins: { [item.id]: { w: item.w, h: item.h } } });
  };

  const commit = (changes) => {
    dispatch({ type: "do", changes });
    live.sendOps(opsFor(changes, true));
  };

  const finishEdit = (id, text) => {
    setEditing(null);
    const item = items.find((entry) => entry.id === id);
    if (item && item.text !== text) commit([{ id, before: { text: item.text }, after: { text } }]);
  };

  const undo = () => {
    const entry = state.past.at(-1);
    if (!entry || !canEdit) return;
    dispatch({ type: "undo" });
    live.sendOps(opsFor([...entry].reverse(), false));
  };

  const redo = () => {
    const entry = state.future[0];
    if (!entry || !canEdit) return;
    dispatch({ type: "redo" });
    live.sendOps(opsFor(entry, true));
  };

  const addItem = (type) => {
    if (!canEdit) return;
    const rect = surface.current.getBoundingClientRect();
    const color = noteColors[items.length % noteColors.length];
    const presets = {
      note: { w: 200, h: 190, color, text: "New idea", domain: "" },
      swatch: { w: 120, h: 170, color, text: "New color", domain: "" },
      link: { w: 260, h: 120, color: "paper", text: "New link", domain: "example.com" },
    };
    const preset = presets[type];
    const item = {
      id: newId(),
      type,
      ...preset,
      x: (rect.width / 2 - view.x) / view.scale - preset.w / 2 + (Math.random() * 40 - 20),
      y: (rect.height / 2 - view.y) / view.scale - preset.h / 2 + (Math.random() * 40 - 20),
      rotate: Math.round((Math.random() * 6 - 3) * 10) / 10,
      layer: Date.now(),
    };
    commit([{ id: item.id, before: null, after: item }]);
    setSelected([item.id]);
  };

  const deleteSelected = () => {
    const changes = items.filter((item) => selected.includes(item.id)).map((item) => ({ id: item.id, before: item, after: null }));
    if (!changes.length) return;
    commit(changes);
    setSelected([]);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (editing || renaming !== null) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected.length && canEdit) {
        deleteSelected();
      } else if (event.key === "Escape") {
        setSelected([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onSurfaceMove = (event) => {
    const rect = surface.current.getBoundingClientRect();
    live.sendCursor((event.clientX - rect.left - view.x) / view.scale, (event.clientY - rect.top - view.y) / view.scale);
  };

  const saveTitle = async () => {
    const title = renaming.trim();
    setRenaming(null);
    if (!title || title === live.title) return;
    try {
      await api.patch(`/boards/${boardId}`, { title });
      live.setTitle(title);
    } catch {
      return;
    }
  };

  const zoomFromCenter = (factor) => {
    const rect = surface.current.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  };

  if (live.fatal) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="text-xl font-semibold">{live.fatal}</p>
          {actingAs || !user ? (
            <p className="mt-2 text-sm opacity-70">Ask the owner of the board for a new link.</p>
          ) : (
            <Link to="/" className="chip mt-4 bg-ink/10">Back to your boards</Link>
          )}
        </div>
      </div>
    );
  }
  if (!live.ready) return <Loading label="Opening the board" />;

  const tools = [
    ["note", "Add note", StickyNote],
    ["swatch", "Add color", Palette],
    ["link", "Add link", Link2],
  ];
  const ordered = [...items].sort((a, b) => a.layer - b.layer);
  const card = "rounded-2xl bg-paper shadow-[0_6px_16px_-10px_rgb(35_38_43/0.5)]";

  return (
    <div className="relative h-full w-full">
      <div
        ref={surface}
        onPointerDown={startPan}
        onPointerMove={onSurfaceMove}
        className="absolute inset-0 touch-none overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgb(35 38 43 / 0.22) 1.2px, transparent 1.3px)",
          backgroundSize: `${28 * view.scale}px ${28 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          data-world="true"
          className="absolute left-0 top-0 h-0 w-0"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
        >
          {ordered.map((item) => (
            <ItemView
              key={item.id}
              item={item}
              selected={selected.includes(item.id)}
              lifted={lifted && selected.includes(item.id)}
              editing={editing === item.id}
              onPointerDown={startMove}
              onStartEdit={(id) => canEdit && setEditing(id)}
              onFinishEdit={finishEdit}
              onResizeStart={startResize}
            />
          ))}
          <Cursors peers={live.peers} cursors={live.cursors} meId={meId} scale={view.scale} />
        </div>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className={`pointer-events-auto flex items-center gap-2 px-3 py-2 ${card}`}>
          {!actingAs && (
            <Link to="/" aria-label="All boards" className="chip !px-2">
              <ArrowLeft size={18} />
            </Link>
          )}
          {renaming === null && live.role !== "owner" ? (
            <span className="font-semibold">{live.title}</span>
          ) : renaming === null ? (
            <button onClick={() => setRenaming(live.title)} className="font-semibold" title="Click to rename">
              {live.title}
            </button>
          ) : (
            <input
              autoFocus
              value={renaming}
              maxLength={80}
              onChange={(event) => setRenaming(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="rounded-lg border border-ink/30 bg-white px-2 py-1 font-semibold"
            />
          )}
        </div>
        <div className={`pointer-events-auto flex items-center gap-3 px-3 py-2 ${card}`}>
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className={`h-2.5 w-2.5 rounded-full ${live.status === "live" ? "bg-sage" : "bg-tomato"}`} />
            {live.status === "live" ? "Live" : "Reconnecting"}
          </span>
          <div className="flex -space-x-2">
            {live.peers.map((person) => (
              <span
                key={person.id}
                title={person.id === meId ? `${person.name} (you)` : person.name}
                className={`grid h-8 w-8 place-items-center rounded-full border-2 border-paper text-sm font-semibold ${
                  ["tomato", "cobalt"].includes(person.color) ? "text-paper" : "text-ink"
                }`}
                style={{ background: `var(--color-${person.color})` }}
              >
                {person.name[0]}
              </span>
            ))}
          </div>
          {live.role === "view" && <span className="text-sm font-medium opacity-70">View only</span>}
          {live.role === "owner" && (
            <button onClick={() => setSharing(true)} className="chip bg-cobalt text-paper hover:!bg-cobalt">
              Share
            </button>
          )}
        </div>
      </header>

      {(live.status !== "live" || live.notice) && (
        <p role="status" className={`absolute left-1/2 top-20 -translate-x-1/2 px-4 py-2 text-sm font-medium ${card}`}>
          {live.status !== "live" ? "Connection lost. Editing is paused until we reconnect." : live.notice}
        </p>
      )}

      <nav
        aria-label="Board tools"
        className={`absolute bottom-5 left-1/2 flex max-w-[95vw] -translate-x-1/2 items-center gap-1 overflow-x-auto p-1.5 ${card}`}
      >
        {tools.map(([type, label, Icon]) => (
          <button key={type} onClick={() => addItem(type)} disabled={!canEdit} aria-label={label} className="chip">
            <Icon size={18} />
            <span className="hidden sm:inline">{label.replace("Add ", "")}</span>
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-ink/20" />
        <button onClick={undo} disabled={!state.past.length || !canEdit} aria-label="Undo" className="chip">
          <Undo2 size={18} />
        </button>
        <button onClick={redo} disabled={!state.future.length || !canEdit} aria-label="Redo" className="chip">
          <Redo2 size={18} />
        </button>
        <span className="mx-1 h-6 w-px bg-ink/20" />
        <button onClick={() => zoomFromCenter(1 / 1.2)} aria-label="Zoom out" className="chip">
          <Minus size={18} />
        </button>
        <button onClick={() => setView(DEFAULT_VIEW)} aria-label="Reset view" className="chip w-16 justify-center tabular-nums">
          {Math.round(view.scale * 100)}%
        </button>
        <button onClick={() => zoomFromCenter(1.2)} aria-label="Zoom in" className="chip">
          <Plus size={18} />
        </button>
      </nav>

      <p className="pointer-events-none absolute bottom-6 left-5 hidden max-w-[16rem] text-sm opacity-60 lg:block">
        Scroll to pan. Ctrl and scroll to zoom. Double-click a note to edit it.
      </p>

      {sharing && <ShareDialog boardId={boardId} onClose={() => setSharing(false)} />}
    </div>
  );
}
