import mongoose from "mongoose";
import { MAX_ITEMS_PER_BOARD } from "../constants.js";
import { AppError } from "../errors.js";
import Board from "../models/Board.js";
import Item from "../models/Item.js";
import { createItemSchema, updateItemSchema } from "../schemas.js";

const touchBoard = (boardId) => Board.updateOne({ _id: boardId }, { $set: { updatedAt: new Date() } });

function validItemId(itemId) {
  if (!mongoose.isValidObjectId(itemId)) throw new AppError(404, "Item not found.");
  return itemId;
}

export async function createItem(boardId, input) {
  const data = createItemSchema.parse(input);
  if (!(await Board.exists({ _id: boardId }))) throw new AppError(404, "Board not found.");
  if ((await Item.countDocuments({ board: boardId })) >= MAX_ITEMS_PER_BOARD) {
    throw new AppError(409, `This board is full. A board can hold ${MAX_ITEMS_PER_BOARD} items.`);
  }
  const { id, ...fields } = data;
  const item = await Item.create({ ...fields, ...(id && { _id: id }), board: boardId });
  await touchBoard(boardId);
  return item;
}

export async function updateItem(boardId, itemId, input) {
  const data = updateItemSchema.parse(input);
  const item = await Item.findOneAndUpdate(
    { _id: validItemId(itemId), board: boardId },
    { $set: data },
    { new: true, runValidators: true }
  );
  if (!item) throw new AppError(404, "Item not found.");
  await touchBoard(boardId);
  return item;
}

export async function deleteItem(boardId, itemId) {
  const result = await Item.deleteOne({ _id: validItemId(itemId), board: boardId });
  if (!result.deletedCount) throw new AppError(404, "Item not found.");
  await touchBoard(boardId);
}
