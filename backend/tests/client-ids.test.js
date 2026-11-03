import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import { app, auth, itemPayload, makeBoard, resetDb, signUp, startDb, stopDb } from "./helpers.js";

describe("client generated item ids", () => {
  before(startDb);
  after(stopDb);
  beforeEach(resetDb);

  const create = (token, boardId, body) => request(app).post(`/api/boards/${boardId}/items`).set(auth(token)).send(body);
  const id = "65f0a1b2c3d4e5f607182930";

  it("keeps the id the client chose", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    const response = await create(token, board.id, itemPayload({ id }));
    assert.equal(response.status, 201);
    assert.equal(response.body.item.id, id);
  });

  it("refuses an id that is already taken, even on another board", async () => {
    const { token } = await signUp();
    const first = await makeBoard(token, "First");
    const second = await makeBoard(token, "Second");
    await create(token, first.id, itemPayload({ id }));
    const response = await create(token, second.id, itemPayload({ id }));
    assert.equal(response.status, 409);
  });

  it("refuses an id that is not a valid object id", async () => {
    const { token } = await signUp();
    const board = await makeBoard(token);
    assert.equal((await create(token, board.id, itemPayload({ id: "abc" }))).status, 400);
  });
});
