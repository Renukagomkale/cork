import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import Item from "../src/models/Item.js";
import { app, auth, itemPayload, makeBoard, resetDb, signUp, startDb, stopDb } from "./helpers.js";

describe("items", () => {
  before(startDb);
  after(stopDb);
  beforeEach(resetDb);

  const create = (token, boardId, body) =>
    request(app).post(`/api/boards/${boardId}/items`).set(auth(token)).send(body);

  it("creates an item with defaults", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const response = await create(token, board.id, itemPayload());
    assert.equal(response.status, 201);
    assert.equal(response.body.item.rotate, 0);
    assert.equal(response.body.item.domain, "");
    assert.equal(typeof response.body.item.layer, "number");
    assert.equal(response.body.item.board, board.id);
  });

  it("rejects invalid items", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const bad = [
      itemPayload({ type: "video" }),
      itemPayload({ w: 5 }),
      itemPayload({ x: 1e9 }),
      itemPayload({ color: "hotpink" }),
      itemPayload({ text: "x".repeat(2001) }),
      itemPayload({ board: "507f1f77bcf86cd799439011" }),
      { type: "note" },
    ];
    for (const body of bad) {
      assert.equal((await create(token, board.id, body)).status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(await Item.countDocuments(), 0);
  });

  it("updates only the fields that are sent", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const { item } = (await create(token, board.id, itemPayload())).body;
    const response = await request(app)
      .patch(`/api/boards/${board.id}/items/${item.id}`)
      .set(auth(token))
      .send({ x: 300, y: 350 });
    assert.equal(response.status, 200);
    assert.equal(response.body.item.x, 300);
    assert.equal(response.body.item.text, "First idea");
  });

  it("rejects empty, unknown and type-changing updates", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const { item } = (await create(token, board.id, itemPayload())).body;
    const url = `/api/boards/${board.id}/items/${item.id}`;
    assert.equal((await request(app).patch(url).set(auth(token)).send({})).status, 400);
    assert.equal((await request(app).patch(url).set(auth(token)).send({ type: "link" })).status, 400);
    assert.equal((await request(app).patch(url).set(auth(token)).send({ board: board.id })).status, 400);
  });

  it("cannot reach an item through a different board", async () => {
    const { token } = await signUp();
    const first = await makeBoard(token, "First");
    const second = await makeBoard(token, "Second");
    const { item } = (await create(token, first.id, itemPayload())).body;
    const url = `/api/boards/${second.id}/items/${item.id}`;
    assert.equal((await request(app).patch(url).set(auth(token)).send({ x: 1 })).status, 404);
    assert.equal((await request(app).delete(url).set(auth(token))).status, 404);
  });

  it("blocks other people from changing my board", async () => {
    const maya = await signUp();
    const arjun = await signUp("arjun@example.com", "Arjun Rao");
    const board = await makeBoard(maya.token);
    const { item } = (await create(maya.token, board.id, itemPayload())).body;
    assert.equal((await create(arjun.token, board.id, itemPayload())).status, 404);
    const url = `/api/boards/${board.id}/items/${item.id}`;
    assert.equal((await request(app).patch(url).set(auth(arjun.token)).send({ x: 1 })).status, 404);
    assert.equal((await request(app).delete(url).set(auth(arjun.token))).status, 404);
    assert.equal(await Item.countDocuments(), 1);
  });

  it("deletes an item once", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const { item } = (await create(token, board.id, itemPayload())).body;
    const url = `/api/boards/${board.id}/items/${item.id}`;
    assert.equal((await request(app).delete(url).set(auth(token))).status, 204);
    assert.equal((await request(app).delete(url).set(auth(token))).status, 404);
    assert.equal((await request(app).patch(`/api/boards/${board.id}/items/nope`).set(auth(token)).send({ x: 1 })).status, 404);
  });

  it("limits the number of items on a board", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    await Item.insertMany(Array.from({ length: 500 }, () => ({ ...itemPayload(), board: board.id })));
    assert.equal((await create(token, board.id, itemPayload())).status, 409);
  });

  it("moves a board to the top of the list when its items change", async () => {
    const { token } = await signUp();
    const older = await makeBoard(token, "Older");
    await makeBoard(token, "Newer");
    await create(token, older.id, itemPayload());
    const response = await request(app).get("/api/boards").set(auth(token));
    assert.equal(response.body.boards[0].title, "Older");
  });
});
