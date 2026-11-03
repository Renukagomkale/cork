import { Router } from "express";
import { emitToBoard } from "../realtime.js";
import { createItem, deleteItem, updateItem } from "../services/items.js";

const router = Router();

router.post("/", async (req, res) => {
  const item = (await createItem(req.board._id, req.body)).toJSON();
  emitToBoard(req.app, req.board.id, "item:created", { item });
  res.status(201).json({ item });
});

router.patch("/:itemId", async (req, res) => {
  const item = (await updateItem(req.board._id, req.params.itemId, req.body)).toJSON();
  emitToBoard(req.app, req.board.id, "items:updated", { items: [item] });
  res.json({ item });
});

router.delete("/:itemId", async (req, res) => {
  await deleteItem(req.board._id, req.params.itemId);
  emitToBoard(req.app, req.board.id, "item:deleted", { itemId: req.params.itemId });
  res.status(204).end();
});

export default router;
