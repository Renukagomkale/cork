import mongoose from "mongoose";
import Board from "../models/Board.js";
import ShareLink, { activeFilter } from "../models/ShareLink.js";

export async function linkIsActive(guest) {
  if (!mongoose.isValidObjectId(guest.linkId) || !mongoose.isValidObjectId(guest.boardId)) return false;
  return Boolean(await ShareLink.exists({ _id: guest.linkId, board: guest.boardId, ...activeFilter() }));
}

export async function getBoardAccess(identity, boardId) {
  if (!mongoose.isValidObjectId(boardId)) return null;
  const board = await Board.findById(boardId);
  if (!board) return null;
  if (identity.user) return board.owner.equals(identity.user._id) ? { board, role: "owner" } : null;
  const { guest } = identity;
  if (guest.boardId !== String(board._id) || !mongoose.isValidObjectId(guest.linkId)) return null;
  const link = await ShareLink.findOne({ _id: guest.linkId, board: board._id, ...activeFilter() });
  return link ? { board, role: link.role } : null;
}

export const canEdit = (role) => role === "owner" || role === "edit";
