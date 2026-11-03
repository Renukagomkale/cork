import mongoose from "mongoose";
import { config } from "./config.js";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "./seedDemo.js";

if (!config.mongoUri) throw new Error("MONGODB_URI is not set");

await mongoose.connect(config.mongoUri);
const result = await seedDemo({ reset: process.argv.includes("--reset") });

if (result.created) {
  console.log(`Created the demo board "${result.board.title}".`);
  console.log(`Sign in with ${DEMO_EMAIL} and ${DEMO_PASSWORD}`);
  console.log(`Guest link with edit access: ${config.clientOrigins[0]}/s/${result.shareToken}`);
} else {
  console.log("Demo data already exists. Run npm run seed:reset to rebuild it.");
}

await mongoose.disconnect();
