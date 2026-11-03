import mongoose from "mongoose";
import { publicJson } from "./shape.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true, toJSON: publicJson(["passwordHash"]) }
);

export default mongoose.model("User", userSchema);
