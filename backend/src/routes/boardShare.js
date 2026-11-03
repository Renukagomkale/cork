import { randomBytes } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { MAX_ACTIVE_LINKS_PER_BOARD } from "../constants.js";
import { AppError } from "../errors.js";
import { hashToken } from "../lib/tokens.js";
import ShareLink, { activeFilter } from "../models/ShareLink.js";
import { kickLink } from "../realtime.js";
import { createLinkSchema } from "../schemas.js";

const router = Router();

router.get("/", async (req, res) => {
  const links = await ShareLink.find({ board: req.board._id, ...activeFilter() }).sort({ createdAt: -1 });
  res.json({ links });
});

router.post("/", async (req, res) => {
  const data = createLinkSchema.parse(req.body);
  if ((await ShareLink.countDocuments({ board: req.board._id, ...activeFilter() })) >= MAX_ACTIVE_LINKS_PER_BOARD) {
    throw new AppError(409, `A board can have ${MAX_ACTIVE_LINKS_PER_BOARD} active links. Revoke one first.`);
  }
  const token = randomBytes(24).toString("base64url");
  const link = await ShareLink.create({
    board: req.board._id,
    tokenHash: hashToken(token),
    role: data.role,
    createdBy: req.user._id,
    expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400000) : null,
  });
  res.status(201).json({ link, token });
});

router.delete("/:linkId", async (req, res) => {
  const { linkId } = req.params;
  const link = mongoose.isValidObjectId(linkId)
    ? await ShareLink.findOneAndUpdate({ _id: linkId, board: req.board._id, revokedAt: null }, { $set: { revokedAt: new Date() } })
    : null;
  if (!link) throw new AppError(404, "Link not found.");
  await kickLink(req.app, req.board.id, link.id);
  res.status(204).end();
});

export default router;
