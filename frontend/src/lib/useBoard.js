import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getToken } from "../api";
import { clearGuest, guestSession } from "./guest";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export default function useBoard(boardId, dispatch, onDeleted) {
  const [status, setStatus] = useState("connecting");
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState({ title: "", role: "view" });
  const [peers, setPeers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [notice, setNotice] = useState("");
  const [fatal, setFatal] = useState("");
  const socketRef = useRef(null);
  const joinRef = useRef(() => {});
  const lastCursor = useRef(0);
  const deletedRef = useRef(onDeleted);
  deletedRef.current = onDeleted;

  useEffect(() => {
    const guest = guestSession(boardId);
    const socket = io(SOCKET_URL, { auth: (done) => done({ token: guest?.token ?? getToken() }), transports: ["websocket"] });
    socketRef.current = socket;

    const join = () =>
      socket.emit("board:join", { boardId }, (reply) => {
        if (!reply.ok) return setFatal(reply.message);
        dispatch({ type: "load", items: reply.items });
        setMeta({ title: reply.board.title, role: reply.role });
        setPeers(reply.peers);
        setReady(true);
        setStatus("live");
      });
    joinRef.current = join;

    socket.on("connect", join);
    socket.on("disconnect", () => {
      setStatus("offline");
      setCursors({});
    });
    socket.on("connect_error", (error) => {
      setStatus("offline");
      if (!/session|Sign in/.test(error.message)) return;
      if (guest) {
        clearGuest(boardId);
        setFatal("Your guest session has expired. Open the share link again.");
      } else {
        window.dispatchEvent(new Event("cork:logout"));
      }
    });
    ["item:created", "items:updated", "item:deleted"].forEach((event) =>
      socket.on(event, (payload) => dispatch({ type: "remote", event, payload }))
    );
    socket.on("board:renamed", ({ title }) => setMeta((current) => ({ ...current, title })));
    socket.on("board:deleted", () => deletedRef.current());
    socket.on("access:revoked", () => {
      clearGuest(boardId);
      setFatal("The owner stopped sharing this board.");
    });
    socket.on("presence:joined", ({ person }) =>
      setPeers((current) => (current.some((p) => p.id === person.id) ? current : [...current, person]))
    );
    socket.on("presence:left", ({ personId }) => {
      setPeers((current) => current.filter((p) => p.id !== personId));
      setCursors(({ [personId]: gone, ...rest }) => rest);
    });
    socket.on("cursor:moved", ({ personId, x, y }) => setCursors((current) => ({ ...current, [personId]: { x, y } })));

    return () => socket.disconnect();
  }, [boardId, dispatch]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const send = useCallback(
    (event, payload) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit(event, { boardId, ...payload }, (reply) => {
        if (reply?.ok) return;
        setNotice(reply?.message ?? "That change could not be saved.");
        joinRef.current();
      });
    },
    [boardId]
  );

  const sendUpdates = useCallback(
    (updates) => {
      for (let start = 0; start < updates.length; start += 50) send("items:update", { updates: updates.slice(start, start + 50) });
    },
    [send]
  );

  const sendOps = useCallback(
    ({ creates, updates, deletes }) => {
      creates.forEach((item) => send("item:create", { item }));
      if (updates.length) sendUpdates(updates);
      deletes.forEach((itemId) => send("item:delete", { itemId }));
    },
    [send, sendUpdates]
  );

  const sendCursor = useCallback(
    (x, y) => {
      const now = Date.now();
      if (now - lastCursor.current < 50 || !socketRef.current?.connected) return;
      lastCursor.current = now;
      socketRef.current.volatile.emit("cursor:move", { boardId, x, y });
    },
    [boardId]
  );

  return { status, ready, fatal, notice, peers, cursors, role: meta.role, title: meta.title, setTitle: (title) => setMeta((m) => ({ ...m, title })), sendOps, sendUpdates, sendCursor };
}
