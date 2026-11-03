import { Server } from "socket.io";
import { z } from "zod";
import { config } from "./config.js";
import { AppError, describeError } from "./errors.js";
import { createLimiter } from "./lib/limiter.js";
import { identityFromToken } from "./middleware/auth.js";
import Item from "./models/Item.js";
import { boardRoom } from "./realtime.js";
import { canEdit, getBoardAccess, linkIsActive } from "./services/access.js";
import { createItem, deleteItem, updateItem } from "./services/items.js";

const PERSON_COLORS = ["tomato", "cobalt", "sunflower", "sage"];
const coordinate = z.number().min(-100000).max(100000);

const boardRef = z.object({ boardId: z.string().min(1) });
const cursorSchema = boardRef.extend({ x: coordinate, y: coordinate });
const batchSchema = boardRef.extend({
  updates: z.array(z.object({ itemId: z.string(), changes: z.unknown() })).min(1).max(50),
});

const colorFor = (userId) => PERSON_COLORS[parseInt(userId.slice(-6), 16) % PERSON_COLORS.length];

async function authenticate(socket, next) {
  try {
    const identity = await identityFromToken(socket.handshake.auth?.token);
    const source = identity.user ?? identity.guest;
    socket.data.identity = identity;
    socket.data.person = { id: source.id, name: source.name, color: colorFor(source.id) };
    socket.data.linkId = identity.guest?.linkId ?? null;
    next();
  } catch (error) {
    next(new Error(error.message));
  }
}

function handle(limiter, work) {
  return async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!limiter.allow()) return reply({ ok: false, message: "You are sending changes too fast. Slow down.", errors: null });
    try {
      return reply({ ok: true, ...(await work(payload ?? {})) });
    } catch (error) {
      return reply({ ok: false, ...describeError(error).body });
    }
  };
}

async function editableBoard(socket, boardId) {
  const role = socket.data.joined.get(boardId);
  if (!role) throw new AppError(403, "Join the board before changing it.");
  if (!canEdit(role)) throw new AppError(403, "You can view this board but not change it.");
  const { guest } = socket.data.identity;
  if (guest && !(await linkIsActive(guest))) {
    setImmediate(() => socket.disconnect(true));
    throw new AppError(403, "This link is no longer valid.");
  }
  return boardId;
}

async function peersOf(io, room) {
  const sockets = await io.in(room).fetchSockets();
  return [...new Map(sockets.map((s) => [s.data.person.id, s.data.person])).values()];
}

async function announceIfGone(io, socket, room) {
  const personId = socket.data.person.id;
  const sockets = await io.in(room).fetchSockets();
  if (!sockets.some((s) => s.id !== socket.id && s.data.person.id === personId)) {
    io.to(room).emit("presence:left", { personId });
  }
}

function register(io, socket) {
  const { person } = socket.data;
  const general = createLimiter(60, 1000);
  const cursors = createLimiter(40, 1000);
  socket.data.joined = new Map();

  socket.on(
    "board:join",
    handle(general, async (payload) => {
      const { boardId } = boardRef.parse(payload);
      const access = await getBoardAccess(socket.data.identity, boardId);
      if (!access) throw new AppError(404, "Board not found.");
      const id = access.board.id;
      const room = boardRoom(id);
      const alreadyPresent = (await io.in(room).fetchSockets()).some((s) => s.data.person.id === person.id);
      socket.join(room);
      socket.data.joined.set(id, access.role);
      if (!alreadyPresent) socket.to(room).emit("presence:joined", { person });
      const items = await Item.find({ board: id }).sort({ layer: 1, _id: 1 });
      return {
        board: access.board.toJSON(),
        items: items.map((item) => item.toJSON()),
        role: access.role,
        peers: await peersOf(io, room),
      };
    })
  );

  socket.on(
    "board:leave",
    handle(general, async (payload) => {
      const { boardId } = boardRef.parse(payload);
      if (socket.data.joined.delete(boardId)) {
        socket.leave(boardRoom(boardId));
        await announceIfGone(io, socket, boardRoom(boardId));
      }
      return {};
    })
  );

  socket.on(
    "item:create",
    handle(general, async (payload) => {
      const { boardId } = boardRef.parse(payload);
      const id = await editableBoard(socket, boardId);
      const item = (await createItem(id, payload.item)).toJSON();
      socket.to(boardRoom(id)).emit("item:created", { item });
      return { item };
    })
  );

  socket.on(
    "items:update",
    handle(general, async (payload) => {
      const { boardId, updates } = batchSchema.parse(payload);
      const id = await editableBoard(socket, boardId);
      const items = (await Promise.all(updates.map((u) => updateItem(id, u.itemId, u.changes)))).map((item) => item.toJSON());
      socket.to(boardRoom(id)).emit("items:updated", { items });
      return { items };
    })
  );

  socket.on(
    "item:delete",
    handle(general, async (payload) => {
      const { boardId } = boardRef.parse(payload);
      const id = await editableBoard(socket, boardId);
      await deleteItem(id, payload.itemId);
      socket.to(boardRoom(id)).emit("item:deleted", { itemId: payload.itemId });
      return {};
    })
  );

  socket.on("cursor:move", (payload) => {
    if (!cursors.allow()) return;
    const parsed = cursorSchema.safeParse(payload);
    if (!parsed.success || !socket.data.joined.has(parsed.data.boardId)) return;
    const { boardId, x, y } = parsed.data;
    socket.to(boardRoom(boardId)).volatile.emit("cursor:moved", { personId: person.id, x, y });
  });

  socket.on("disconnect", async () => {
    for (const boardId of socket.data.joined.keys()) await announceIfGone(io, socket, boardRoom(boardId));
  });
}

export function attachSocket(httpServer, app) {
  const io = new Server(httpServer, { cors: { origin: config.clientOrigins } });
  app.set("io", io);
  io.use(authenticate);
  io.on("connection", (socket) => register(io, socket));
  return io;
}
