import mongoose from "mongoose";
import { publicJson } from "./shape.js";

const shareLinkSchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    role: { type: String, enum: ["view", "edit"], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: publicJson(["tokenHash"]) }
);

export const activeFilter = () => ({
  revokedAt: null,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

export default mongoose.model("ShareLink", shareLinkSchema);
