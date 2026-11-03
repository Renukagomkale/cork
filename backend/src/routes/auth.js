import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import User from "../models/User.js";
import { loginSchema, registerSchema } from "../schemas.js";

const router = Router();
const dummyHash = bcrypt.hashSync("not-a-real-password", 10);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: () => config.nodeEnv === "test",
  message: { message: "Too many attempts. Try again in a few minutes.", errors: null },
});

router.post("/register", limiter, async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (await User.exists({ email: data.email })) {
    throw new AppError(409, "An account with this email already exists.");
  }
  const user = await User.create({
    name: data.name,
    email: data.email,
    passwordHash: await bcrypt.hash(data.password, 10),
  });
  res.status(201).json({ user, token: signToken(user) });
});

router.post("/login", limiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await User.findOne({ email: data.email }).select("+passwordHash");
  const matches = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
  if (!user || !matches) throw new AppError(401, "Incorrect email or password.");
  res.json({ user, token: signToken(user) });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
