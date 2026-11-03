import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import User from "../src/models/User.js";
import { app, auth, resetDb, signUp, startDb, stopDb } from "./helpers.js";

describe("auth", () => {
  before(startDb);
  after(stopDb);
  beforeEach(resetDb);

  const register = (body) => request(app).post("/api/auth/register").send(body);
  const valid = { name: "Maya Joshi", email: "maya@example.com", password: "Sunny-day-42" };

  it("registers a user and returns a token without the password", async () => {
    const response = await register(valid);
    assert.equal(response.status, 201);
    assert.ok(response.body.token);
    assert.equal(response.body.user.email, "maya@example.com");
    assert.equal(response.body.user.passwordHash, undefined);
    assert.equal(response.body.user.password, undefined);
  });

  it("stores only a hash of the password", async () => {
    await register(valid);
    const stored = await User.findOne({ email: valid.email }).select("+passwordHash");
    assert.notEqual(stored.passwordHash, valid.password);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
  });

  it("rejects a duplicate email regardless of case", async () => {
    await register(valid);
    const response = await register({ ...valid, email: "MAYA@Example.com" });
    assert.equal(response.status, 409);
  });

  it("rejects a short password and an invalid email", async () => {
    const short = await register({ ...valid, password: "short" });
    assert.equal(short.status, 400);
    assert.ok(short.body.errors.password);
    const badEmail = await register({ ...valid, email: "nope" });
    assert.equal(badEmail.status, 400);
    assert.ok(badEmail.body.errors.email);
  });

  it("rejects malformed JSON", async () => {
    const response = await request(app).post("/api/auth/register").set("Content-Type", "application/json").send("{bad");
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Request body is not valid JSON.");
  });

  it("logs in with the right password only", async () => {
    await register(valid);
    const ok = await request(app).post("/api/auth/login").send({ email: valid.email, password: valid.password });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    const wrong = await request(app).post("/api/auth/login").send({ email: valid.email, password: "Wrong-pass-1" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "who@example.com", password: "Wrong-pass-1" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  it("protects /me", async () => {
    assert.equal((await request(app).get("/api/auth/me")).status, 401);
    assert.equal((await request(app).get("/api/auth/me").set(auth("not-a-token"))).status, 401);
    const { token } = await signUp();
    const response = await request(app).get("/api/auth/me").set(auth(token));
    assert.equal(response.status, 200);
    assert.equal(response.body.user.name, "Maya Joshi");
  });

  it("rejects a valid token whose user no longer exists", async () => {
    const { token, user } = await signUp();
    await User.deleteOne({ _id: user.id });
    assert.equal((await request(app).get("/api/auth/me").set(auth(token))).status, 401);
  });
});
