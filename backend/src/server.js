import { createServer } from "node:http";
import mongoose from "mongoose";
import app from "./app.js";
import { config } from "./config.js";
import { attachSocket } from "./socket.js";

if (!config.mongoUri) throw new Error("MONGODB_URI is not set");

await mongoose.connect(config.mongoUri);

const server = createServer(app);
attachSocket(server, app);
server.listen(config.port, () => console.log(`Cork API listening on port ${config.port}`));
