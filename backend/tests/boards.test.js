import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import Board from "../src/models/Board.js";
import Item from "../src/models/Item.js";
import { app, auth, itemPayload, makeBoard, resetDb, signUp, startDb, stopDb } from "./helpers.js";

describe("boards", () => {
  before(startDb);
  after(stopDb);
  beforeEach(resetDb);

  it("requires sign in", async () => {
    assert.equal((await request(app).get("/api/boards")).status, 401);
  });

  it("creates a board with a default title", async () => {
    const { token } = await signUp();
    const response = await request(app).post("/api/boards").set(auth(token)).send({});
    assert.equal(response.status, 201);
    assert.equal(response.body.board.title, "Untitled board");
    assert.ok(response.body.board.id);
  });

  it("lists only my boards with pagination", async () => {
    const maya = await signUp();
    const arjun = await signUp("arjun@example.com", "Arjun Rao");
    for (const title of ["One", "Two", "Three"]) await makeBoard(maya.token, title);
    await makeBoard(arjun.token, "Not mine");
    const first = await request(app).get("/api/boards?limit=2").set(auth(maya.token));
    assert.equal(first.body.total, 3);
    assert.equal(first.body.boards.length, 2);
    const second = await request(app).get("/api/boards?limit=2&page=2").set(auth(maya.token));
    assert.equal(second.body.boards.length, 1);
    assert.equal((await request(app).get("/api/boards?limit=500").set(auth(maya.token))).status, 400);
  });

  it("hides other people's boards behind a 404", async () => {
    const maya = await signUp();
    const arjun = await signUp("arjun@example.com", "Arjun Rao");
    const board = await makeBoard(maya.token, "Private");
    const url = `/api/boards/${board.id}`;
    assert.equal((await request(app).get(url).set(auth(arjun.token))).status, 404);
    assert.equal((await request(app).patch(url).set(auth(arjun.token)).send({ title: "Mine now" })).status, 404);
    assert.equal((await request(app).delete(url).set(auth(arjun.token))).status, 404);
    assert.equal((await request(app).get(url).set(auth(maya.token))).status, 200);
  });

  it("returns 404 for a malformed board id", async () => {
    const { token } = await signUp();
    assert.equal((await request(app).get("/api/boards/not-an-id").set(auth(token))).status, 404);
  });

  it("returns the board with its items in layer order", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    await request(app).post(`/api/boards/${board.id}/items`).set(auth(token)).send(itemPayload({ text: "top", layer: 5 }));
    await request(app).post(`/api/boards/${board.id}/items`).set(auth(token)).send(itemPayload({ text: "bottom", layer: 1 }));
    const response = await request(app).get(`/api/boards/${board.id}`).set(auth(token));
    assert.equal(response.body.role, "owner");
    assert.deepEqual(response.body.items.map((item) => item.text), ["bottom", "top"]);
  });

  it("renames a board and rejects bad input", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const url = `/api/boards/${board.id}`;
    const renamed = await request(app).patch(url).set(auth(token)).send({ title: "Spring campaign" });
    assert.equal(renamed.body.board.title, "Spring campaign");
    assert.equal((await request(app).patch(url).set(auth(token)).send({ title: "  " })).status, 400);
    assert.equal((await request(app).patch(url).set(auth(token)).send({ title: "Ok", owner: "someone" })).status, 400);
  });

  it("deletes a board together with its items", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    await request(app).post(`/api/boards/${board.id}/items`).set(auth(token)).send(itemPayload());
    assert.equal((await request(app).delete(`/api/boards/${board.id}`).set(auth(token))).status, 204);
    assert.equal(await Board.countDocuments(), 0);
    assert.equal(await Item.countDocuments(), 0);
  });

  it("limits how many boards one person can own", async () => {
    const { token, user } = await signUp();
    await Board.insertMany(Array.from({ length: 50 }, (_, index) => ({ title: `Board ${index}`, owner: user.id })));
    const response = await request(app).post("/api/boards").set(auth(token)).send({});
    assert.equal(response.status, 409);
  });
});
