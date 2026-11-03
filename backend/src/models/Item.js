import mongoose from "mongoose";
import { ITEM_COLORS, ITEM_TYPES } from "../constants.js";
import { publicJson } from "./shape.js";

const itemSchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    type: { type: String, enum: ITEM_TYPES, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    rotate: { type: Number, default: 0 },
    color: { type: String, enum: ITEM_COLORS, required: true },
    text: { type: String, default: "", maxlength: 2000 },
    domain: { type: String, default: "", maxlength: 200 },
    layer: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: publicJson() }
);

export default mongoose.model("Item", itemSchema);
