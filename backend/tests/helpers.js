import { createServer } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as connect } from "socket.io-client";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";

export const { default: app } = await import("../src/app.js");
const { attachSocket } = await import("../src/socket.js");

let server;

export async function startDb() {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
}

export async function stopDb() {
  await mongoose.disconnect();
  await server.stop();
}

export async function resetDb() {
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.deleteMany({})));
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export async function signUp(email = "maya@example.com", name = "Maya Joshi") {
  const response = await request(app).post("/api/auth/register").send({ name, email, password: "Sunny-day-42" });
  return { token: response.body.token, user: response.body.user };
}

export async function makeBoard(token, title) {
  const response = await request(app).post("/api/boards").set(auth(token)).send(title ? { title } : {});
  return response.body.board;
}

export const itemPayload = (overrides = {}) => ({
  type: "note",
  x: 100,
  y: 200,
  w: 200,
  h: 180,
  color: "sunflower",
  text: "First idea",
  ...overrides,
});

export async function startServer() {
  const server = createServer(app);
  const io = attachSocket(server, app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { io, url: `http://localhost:${server.address().port}` };
}

export async function connectClient(url, token) {
  const socket = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

export const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

export const waitFor = (socket, event, ms = 1500) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

export const expectSilence = (socket, event, ms = 300) =>
  new Promise((resolve, reject) => {
    const fail = () => reject(new Error(`Unexpected ${event}`));
    socket.once(event, fail);
    setTimeout(() => {
      socket.off(event, fail);
      resolve();
    }, ms);
  });
