import { Router } from "express";
import { MAX_BOARDS_PER_USER } from "../constants.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import Board from "../models/Board.js";
import { closeBoard, emitToBoard } from "../realtime.js";
import { getBoardAccess } from "../services/access.js";
import Item from "../models/Item.js";
import ShareLink from "../models/ShareLink.js";
import { createBoardSchema, pageSchema, updateBoardSchema } from "../schemas.js";
import boardShareRouter from "./boardShare.js";
import itemsRouter from "./items.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { page, limit } = pageSchema.parse(req.query);
  const filter = { owner: req.user._id };
  const [boards, total] = await Promise.all([
    Board.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Board.countDocuments(filter),
  ]);
  res.json({ boards, total, page, limit });
});

router.post("/", async (req, res) => {
  const data = createBoardSchema.parse(req.body);
  if ((await Board.countDocuments({ owner: req.user._id })) >= MAX_BOARDS_PER_USER) {
    throw new AppError(409, `You can have up to ${MAX_BOARDS_PER_USER} boards. Delete one to make room.`);
  }
  const board = await Board.create({ title: data.title, owner: req.user._id });
  res.status(201).json({ board });
});

async function loadBoard(req, res, next) {
  const access = await getBoardAccess({ user: req.user }, req.params.boardId);
  if (!access) throw new AppError(404, "Board not found.");
  req.board = access.board;
  req.role = access.role;
  next();
}

router.use("/:boardId", loadBoard);
router.use("/:boardId/items", itemsRouter);
router.use("/:boardId/share", boardShareRouter);

router.get("/:boardId", async (req, res) => {
  const items = await Item.find({ board: req.board._id }).sort({ layer: 1, _id: 1 });
  res.json({ board: req.board, items, role: req.role });
});

router.patch("/:boardId", async (req, res) => {
  const data = updateBoardSchema.parse(req.body);
  req.board.title = data.title;
  await req.board.save();
  emitToBoard(req.app, req.board.id, "board:renamed", { title: req.board.title });
  res.json({ board: req.board });
});

router.delete("/:boardId", async (req, res) => {
  await Item.deleteMany({ board: req.board._id });
  await ShareLink.deleteMany({ board: req.board._id });
  await req.board.deleteOne();
  closeBoard(req.app, req.board.id);
  res.status(204).end();
});

export default router;
