import { randomBytes } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { hashToken } from "../lib/tokens.js";
import { signGuestToken } from "../middleware/auth.js";
import Board from "../models/Board.js";
import ShareLink, { activeFilter } from "../models/ShareLink.js";
import { joinSchema } from "../schemas.js";

const router = Router();
const tokenShape = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skip: () => config.nodeEnv === "test",
  message: { message: "Too many attempts. Try again in a few minutes.", errors: null },
});

async function activeLink(rawToken) {
  const parsed = tokenShape.safeParse(rawToken);
  const link = parsed.success ? await ShareLink.findOne({ tokenHash: hashToken(parsed.data), ...activeFilter() }) : null;
  const board = link ? await Board.findById(link.board) : null;
  if (!link || !board) throw new AppError(404, "This link is not valid anymore.");
  return { link, board };
}

router.get("/:token", limiter, async (req, res) => {
  const { link, board } = await activeLink(req.params.token);
  res.json({ board: { id: board.id, title: board.title }, role: link.role });
});

router.post("/:token/join", limiter, async (req, res) => {
  const { name } = joinSchema.parse(req.body);
  const { link, board } = await activeLink(req.params.token);
  const id = randomBytes(12).toString("hex");
  const token = signGuestToken({ id, boardId: board.id, linkId: link.id, name });
  res.json({ token, guest: { id, name }, role: link.role, board: { id: board.id, title: board.title } });
});

export default router;
