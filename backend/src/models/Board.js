import mongoose from "mongoose";
import { publicJson } from "./shape.js";

const boardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true, toJSON: publicJson() }
);

export default mongoose.model("Board", boardSchema);
