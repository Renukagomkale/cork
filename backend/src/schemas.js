import { z } from "zod";
import { ITEM_COLORS, ITEM_TYPES } from "./constants.js";

const coordinate = z.number().min(-100000).max(100000);

const itemFields = {
  x: coordinate,
  y: coordinate,
  w: z.number().min(40).max(2000),
  h: z.number().min(40).max(2000),
  rotate: z.number().min(-180).max(180),
  color: z.enum(ITEM_COLORS),
  text: z.string().max(2000),
  domain: z.string().max(200),
  layer: z.number(),
};

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createBoardSchema = z
  .object({ title: z.string().trim().min(1).max(80).default("Untitled board") })
  .strict();

export const updateBoardSchema = z.object({ title: z.string().trim().min(1).max(80) }).strict();

export const createItemSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
    type: z.enum(ITEM_TYPES),
    x: itemFields.x,
    y: itemFields.y,
    w: itemFields.w,
    h: itemFields.h,
    color: itemFields.color,
    rotate: itemFields.rotate.default(0),
    text: itemFields.text.default(""),
    domain: itemFields.domain.default(""),
    layer: itemFields.layer.default(() => Date.now()),
  })
  .strict();

export const updateItemSchema = z
  .object(itemFields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Send at least one field to change." });

export const createLinkSchema = z
  .object({
    role: z.enum(["view", "edit"]),
    expiresInDays: z.number().int().min(1).max(90).optional(),
  })
  .strict();

export const joinSchema = z.object({ name: z.string().trim().min(1).max(40) });
