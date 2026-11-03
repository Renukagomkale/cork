export const boardRoom = (boardId) => `board:${boardId}`;

export const emitToBoard = (app, boardId, event, payload) => app.get("io")?.to(boardRoom(boardId)).emit(event, payload);

export function closeBoard(app, boardId) {
  const io = app.get("io");
  if (!io) return;
  const room = boardRoom(boardId);
  io.to(room).emit("board:deleted", { boardId: String(boardId) });
  io.in(room).socketsLeave(room);
}

export async function kickLink(app, boardId, linkId) {
  const io = app.get("io");
  if (!io) return;
  const sockets = await io.in(boardRoom(boardId)).fetchSockets();
  for (const socket of sockets) {
    if (socket.data.linkId === String(linkId)) {
      socket.emit("access:revoked");
      socket.disconnect(true);
    }
  }
}
