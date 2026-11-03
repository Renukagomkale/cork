import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { hashToken } from "./lib/tokens.js";
import Board from "./models/Board.js";
import Item from "./models/Item.js";
import ShareLink from "./models/ShareLink.js";
import User from "./models/User.js";

export const DEMO_EMAIL = "demo@cork.test";
export const DEMO_PASSWORD = "Demo-pass-2026";

const ITEMS = [
  { type: "note", x: 80, y: 80, w: 220, h: 200, rotate: -2, color: "sunflower", text: "Spring campaign: pale paper, one loud accent, lots of air." },
  { type: "swatch", x: 370, y: 60, w: 120, h: 170, rotate: 2, color: "tomato", text: "Tomato #E5533D" },
  { type: "swatch", x: 510, y: 90, w: 120, h: 170, rotate: -1, color: "cobalt", text: "Cobalt #2F5BEA" },
  { type: "swatch", x: 650, y: 55, w: 120, h: 170, rotate: 1.5, color: "sage", text: "Sage #9DB59A" },
  { type: "swatch", x: 790, y: 100, w: 120, h: 170, rotate: -2, color: "sunflower", text: "Sunflower #F2B632" },
  { type: "link", x: 110, y: 350, w: 260, h: 120, rotate: 1, color: "paper", text: "Studio visit notes", domain: "notion.example.com" },
  { type: "note", x: 440, y: 340, w: 200, h: 190, rotate: 3, color: "sage", text: "Packaging: kraft box, one red stamp, no gloss." },
  { type: "note", x: 700, y: 320, w: 210, h: 190, rotate: -3, color: "tomato", text: "Photo direction: hard shadows, hands in frame, morning light." },
  { type: "link", x: 210, y: 530, w: 260, h: 120, rotate: -1.5, color: "paper", text: "Poster layout references", domain: "are.na/example" },
  { type: "note", x: 560, y: 570, w: 200, h: 170, rotate: 1.5, color: "cobalt", text: "Ask Jonas: can the stamp be foil?" },
];

async function removeDemo(user) {
  const boardIds = (await Board.find({ owner: user._id }).select("_id")).map((board) => board._id);
  await Item.deleteMany({ board: { $in: boardIds } });
  await ShareLink.deleteMany({ board: { $in: boardIds } });
  await Board.deleteMany({ owner: user._id });
  await User.deleteOne({ _id: user._id });
}

export async function seedDemo({ reset = false } = {}) {
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing && !reset) return { created: false };
  if (existing) await removeDemo(existing);

  const user = await User.create({
    name: "Demo Visitor",
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
  });
  const board = await Board.create({ title: "Spring campaign", owner: user._id });
  await Item.insertMany(ITEMS.map((item, index) => ({ ...item, board: board._id, layer: index + 1 })));
  const shareToken = randomBytes(24).toString("base64url");
  await ShareLink.create({ board: board._id, tokenHash: hashToken(shareToken), role: "edit", createdBy: user._id });
  return { created: true, user, board, shareToken };
}
