import { createHash } from "node:crypto";

export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
