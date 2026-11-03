import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import shareJoinRouter from "./routes/shareJoin.js";

const app = express();

if (config.nodeEnv === "production") app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: config.clientOrigins }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/boards", boardsRouter);
app.use("/api/share", shareJoinRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
