import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import User from "../models/User.js";

export const signToken = (user) =>
  jwt.sign({ sub: user.id, type: "user" }, config.jwtSecret, { algorithm: "HS256", expiresIn: "7d" });

export const signGuestToken = ({ id, boardId, linkId, name }) =>
  jwt.sign({ sub: id, type: "guest", board: boardId, link: linkId, name }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "12h",
  });

function readToken(token) {
  if (!token) throw new AppError(401, "Sign in to continue.");
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    throw new AppError(401, "Your session has expired. Sign in again.");
  }
}

async function userFor(payload) {
  const user = payload.type === "user" ? await User.findById(payload.sub) : null;
  if (!user) throw new AppError(401, "Your session has expired. Sign in again.");
  return user;
}

export const userFromToken = async (token) => userFor(readToken(token));

export async function identityFromToken(token) {
  const payload = readToken(token);
  if (payload.type === "guest") {
    return { guest: { id: payload.sub, boardId: payload.board, linkId: payload.link, name: payload.name } };
  }
  return { user: await userFor(payload) };
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  req.user = await userFromToken(header.startsWith("Bearer ") ? header.slice(7) : null);
  next();
}
