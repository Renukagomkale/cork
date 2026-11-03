const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  throw new Error("JWT_SECRET must be set to a random string of at least 32 characters");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: secret,
  clientOrigins: (process.env.CLIENT_URL ?? "http://localhost:5173").split(",").map((origin) => origin.trim()),
};
