import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import Item from "../src/models/Item.js";
import {
  app,
  auth,
  connectClient,
  emitAck,
  expectSilence,
  itemPayload,
  makeBoard,
  resetDb,
  signUp,
  startDb,
  startServer,
  stopDb,
  waitFor,
} from "./helpers.js";

describe("real-time board", () => {
  let io;
  let url;
  let clients = [];

  before(async () => {
    await startDb();
    ({ io, url } = await startServer());
  });

  after(async () => {
    await io.close();
    await stopDb();
  });

  beforeEach(resetDb);

  afterEach(() => {
    clients.forEach((socket) => socket.disconnect());
    clients = [];
  });

  async function tab(token) {
    const socket = await connectClient(url, token);
    clients.push(socket);
    return socket;
  }

  async function setup() {
    const maya = await signUp();
    const board = await makeBoard(maya.token, "Spring campaign");
    const first = await tab(maya.token);
    const second = await tab(maya.token);
    await emitAck(first, "board:join", { boardId: board.id });
    await emitAck(second, "board:join", { boardId: board.id });
    return { maya, board, first, second };
  }

  const newItem = (socket, boardId, overrides) => emitAck(socket, "item:create", { boardId, item: itemPayload(overrides) });

  it("refuses connections without a valid token", async () => {
    await assert.rejects(connectClient(url, undefined), /Sign in to continue/);
    await assert.rejects(connectClient(url, "garbage"), /session has expired/);
  });

  it("sends a full snapshot when joining", async () => {
    const maya = await signUp();
    const board = await makeBoard(maya.token);
    await request(app).post(`/api/boards/${board.id}/items`).set(auth(maya.token)).send(itemPayload({ text: "top", layer: 2 }));
    await request(app).post(`/api/boards/${board.id}/items`).set(auth(maya.token)).send(itemPayload({ text: "bottom", layer: 1 }));
    const socket = await tab(maya.token);
    const reply = await emitAck(socket, "board:join", { boardId: board.id });
    assert.equal(reply.ok, true);
    assert.equal(reply.role, "owner");
    assert.deepEqual(reply.items.map((item) => item.text), ["bottom", "top"]);
    assert.equal(reply.peers.length, 1);
    assert.equal(reply.peers[0].name, "Maya Joshi");
  });

  it("does not let people join boards they cannot access", async () => {
    const maya = await signUp();
    const arjun = await signUp("arjun@example.com", "Arjun Rao");
    const board = await makeBoard(maya.token);
    const socket = await tab(arjun.token);
    assert.equal((await emitAck(socket, "board:join", { boardId: board.id })).ok, false);
    assert.equal((await emitAck(socket, "board:join", { boardId: "not-an-id" })).ok, false);
    assert.equal((await emitAck(socket, "board:join", {})).ok, false);
    const reply = await newItem(socket, board.id);
    assert.equal(reply.ok, false);
    assert.equal(await Item.countDocuments(), 0);
  });

  it("requires joining a board before changing it", async () => {
    const maya = await signUp();
    const board = await makeBoard(maya.token);
    const socket = await tab(maya.token);
    const reply = await newItem(socket, board.id);
    assert.equal(reply.ok, false);
    assert.equal(await Item.countDocuments(), 0);
  });

  it("creates an item, saves it and tells the other tab", async () => {
    const { board, first, second } = await setup();
    const heard = waitFor(second, "item:created");
    const reply = await newItem(first, board.id, { text: "Hello" });
    assert.equal(reply.ok, true);
    assert.equal((await heard).item.id, reply.item.id);
    assert.equal(await Item.countDocuments({ text: "Hello" }), 1);
  });

  it("updates several items at once and broadcasts them", async () => {
    const { board, first, second } = await setup();
    const a = (await newItem(first, board.id, { text: "a" })).item;
    const b = (await newItem(first, board.id, { text: "b" })).item;
    const heard = waitFor(second, "items:updated");
    const reply = await emitAck(first, "items:update", {
      boardId: board.id,
      updates: [
        { itemId: a.id, changes: { x: 500 } },
        { itemId: b.id, changes: { x: 600, y: 700 } },
      ],
    });
    assert.equal(reply.ok, true);
    assert.deepEqual((await heard).items.map((item) => item.x), [500, 600]);
    assert.equal((await Item.findById(b.id)).y, 700);
  });

  it("rejects invalid updates without changing anything", async () => {
    const { board, first } = await setup();
    const item = (await newItem(first, board.id)).item;
    const bad = [
      { itemId: item.id, changes: { w: 1 } },
      { itemId: item.id, changes: { board: "507f1f77bcf86cd799439011" } },
      { itemId: item.id, changes: {} },
    ];
    for (const update of bad) {
      const reply = await emitAck(first, "items:update", { boardId: board.id, updates: [update] });
      assert.equal(reply.ok, false);
    }
    assert.equal((await emitAck(first, "items:update", { boardId: board.id, updates: [] })).ok, false);
    assert.equal((await Item.findById(item.id)).w, 200);
  });

  it("deletes an item and tells the other tab", async () => {
    const { board, first, second } = await setup();
    const item = (await newItem(first, board.id)).item;
    const heard = waitFor(second, "item:deleted");
    assert.equal((await emitAck(first, "item:delete", { boardId: board.id, itemId: item.id })).ok, true);
    assert.equal((await heard).itemId, item.id);
    assert.equal(await Item.countDocuments(), 0);
    assert.equal((await emitAck(first, "item:delete", { boardId: board.id, itemId: item.id })).ok, false);
  });

  it("relays cursors to others but not back to the sender", async () => {
    const { maya, board, first, second } = await setup();
    const heard = waitFor(second, "cursor:moved");
    const echoed = expectSilence(first, "cursor:moved");
    first.emit("cursor:move", { boardId: board.id, x: 120, y: 340 });
    assert.deepEqual(await heard, { personId: maya.user.id, x: 120, y: 340 });
    await echoed;
  });

  it("ignores cursor updates that are invalid or for boards not joined", async () => {
    const { board, first, second } = await setup();
    const silent = expectSilence(second, "cursor:moved");
    first.emit("cursor:move", { boardId: board.id, x: "left", y: 1 });
    first.emit("cursor:move", { boardId: board.id, x: 1e9, y: 1 });
    first.emit("cursor:move", { boardId: "507f1f77bcf86cd799439011", x: 1, y: 1 });
    await silent;
  });

  it("announces a person once even with several tabs open", async () => {
    const maya = await signUp();
    const board = await makeBoard(maya.token);
    const first = await tab(maya.token);
    await emitAck(first, "board:join", { boardId: board.id });
    const quiet = expectSilence(first, "presence:joined");
    const second = await tab(maya.token);
    const reply = await emitAck(second, "board:join", { boardId: board.id });
    assert.equal(reply.peers.length, 1);
    await quiet;
  });

  it("broadcasts changes made through the REST API", async () => {
    const { maya, board, first } = await setup();
    const created = waitFor(first, "item:created");
    await request(app).post(`/api/boards/${board.id}/items`).set(auth(maya.token)).send(itemPayload({ text: "From REST" }));
    assert.equal((await created).item.text, "From REST");
    const renamed = waitFor(first, "board:renamed");
    await request(app).patch(`/api/boards/${board.id}`).set(auth(maya.token)).send({ title: "Renamed" });
    assert.equal((await renamed).title, "Renamed");
  });

  it("closes the room when the board is deleted", async () => {
    const { maya, board, first } = await setup();
    const heard = waitFor(first, "board:deleted");
    await request(app).delete(`/api/boards/${board.id}`).set(auth(maya.token));
    assert.equal((await heard).boardId, board.id);
    const reply = await newItem(first, board.id);
    assert.equal(reply.ok, false);
    assert.equal(await Item.countDocuments(), 0);
  });

  it("slows down a client that sends too many changes", async () => {
    const { board, first } = await setup();
    const item = (await newItem(first, board.id)).item;
    const replies = await Promise.all(
      Array.from({ length: 100 }, () =>
        emitAck(first, "items:update", { boardId: board.id, updates: [{ itemId: item.id, changes: { x: 5 } }] })
      )
    );
    assert.ok(replies.some((reply) => reply.ok === false && /too fast/.test(reply.message)));
  });
});
