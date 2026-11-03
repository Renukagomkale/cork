import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import Item from "../src/models/Item.js";
import ShareLink from "../src/models/ShareLink.js";
import {
  app,
  auth,
  connectClient,
  emitAck,
  itemPayload,
  makeBoard,
  resetDb,
  signUp,
  startDb,
  startServer,
  stopDb,
  waitFor,
} from "./helpers.js";

describe("sharing", () => {
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

  const createLink = (token, boardId, body = { role: "edit" }) =>
    request(app).post(`/api/boards/${boardId}/share`).set(auth(token)).send(body);
  const join = (shareToken, name = "Sam") => request(app).post(`/api/share/${shareToken}/join`).send({ name });

  async function tab(token) {
    const socket = await connectClient(url, token);
    clients.push(socket);
    return socket;
  }

  async function setup(role = "edit") {
    const owner = await signUp();
    const board = await makeBoard(owner.token, "Shared board");
    const created = (await createLink(owner.token, board.id, { role })).body;
    const guest = (await join(created.token)).body;
    return { owner, board, link: created.link, shareToken: created.token, guest };
  }

  async function bothInRoom({ owner, board, guest }) {
    const ownerSocket = await tab(owner.token);
    await emitAck(ownerSocket, "board:join", { boardId: board.id });
    const guestSocket = await tab(guest.token);
    const reply = await emitAck(guestSocket, "board:join", { boardId: board.id });
    return { ownerSocket, guestSocket, reply };
  }

  it("creates a link and stores only a hash of its token", async () => {
    const owner = await signUp();
    const board = await makeBoard(owner.token);
    const response = await createLink(owner.token, board.id);
    assert.equal(response.status, 201);
    assert.ok(response.body.token.length >= 20);
    assert.equal(response.body.link.tokenHash, undefined);
    const stored = await ShareLink.findOne();
    assert.notEqual(stored.tokenHash, response.body.token);
    assert.equal(stored.toObject().token, undefined);
  });

  it("lists active links without their tokens", async () => {
    const owner = await signUp();
    const board = await makeBoard(owner.token);
    const first = (await createLink(owner.token, board.id)).body.token;
    await createLink(owner.token, board.id, { role: "view", expiresInDays: 7 });
    const response = await request(app).get(`/api/boards/${board.id}/share`).set(auth(owner.token));
    assert.equal(response.body.links.length, 2);
    assert.ok(!JSON.stringify(response.body).includes(first));
  });

  it("lets only the owner manage links", async () => {
    const { owner, board, link, guest } = await setup();
    const other = await signUp("arjun@example.com", "Arjun Rao");
    const url = `/api/boards/${board.id}/share`;
    assert.equal((await createLink(other.token, board.id)).status, 404);
    assert.equal((await request(app).get(url).set(auth(other.token))).status, 404);
    assert.equal((await request(app).delete(`${url}/${link.id}`).set(auth(other.token))).status, 404);
    assert.equal((await createLink(guest.token, board.id)).status, 401);
    assert.equal((await request(app).get(url).set(auth(owner.token))).status, 200);
  });

  it("validates the link settings", async () => {
    const owner = await signUp();
    const board = await makeBoard(owner.token);
    for (const body of [{ role: "admin" }, { role: "view", expiresInDays: 0 }, { role: "view", expiresInDays: 91 }, { role: "view", board: "x" }, {}]) {
      assert.equal((await createLink(owner.token, board.id, body)).status, 400, JSON.stringify(body));
    }
  });

  it("limits how many links a board can have", async () => {
    const owner = await signUp();
    const board = await makeBoard(owner.token);
    for (let count = 0; count < 10; count += 1) assert.equal((await createLink(owner.token, board.id)).status, 201);
    assert.equal((await createLink(owner.token, board.id)).status, 409);
  });

  it("shows invite details for a valid link only", async () => {
    const { board, shareToken } = await setup("view");
    const response = await request(app).get(`/api/share/${shareToken}`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { board: { id: board.id, title: "Shared board" }, role: "view" });
    assert.equal((await request(app).get("/api/share/short")).status, 404);
    assert.equal((await request(app).get(`/api/share/${"a".repeat(32)}`)).status, 404);
  });

  it("lets someone join as a guest with a name", async () => {
    const { guest } = await setup();
    assert.equal(guest.role, "edit");
    assert.equal(guest.guest.name, "Sam");
    assert.ok(guest.token);
  });

  it("requires a name to join", async () => {
    const { shareToken } = await setup();
    assert.equal((await request(app).post(`/api/share/${shareToken}/join`).send({ name: "  " })).status, 400);
    assert.equal((await request(app).post(`/api/share/${shareToken}/join`).send({})).status, 400);
  });

  it("refuses revoked and expired links", async () => {
    const { owner, board, link, shareToken } = await setup();
    const expiring = (await createLink(owner.token, board.id, { role: "view", expiresInDays: 1 })).body;
    await ShareLink.updateOne({ _id: expiring.link.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await join(expiring.token)).status, 404);
    assert.equal((await request(app).delete(`/api/boards/${board.id}/share/${link.id}`).set(auth(owner.token))).status, 204);
    assert.equal((await join(shareToken)).status, 404);
    assert.equal((await request(app).delete(`/api/boards/${board.id}/share/${link.id}`).set(auth(owner.token))).status, 404);
  });

  it("does not let a guest token use the account API", async () => {
    const { guest } = await setup();
    assert.equal((await request(app).get("/api/boards").set(auth(guest.token))).status, 401);
    assert.equal((await request(app).get("/api/auth/me").set(auth(guest.token))).status, 401);
  });

  it("removes links when the board is deleted", async () => {
    const { owner, board } = await setup();
    await request(app).delete(`/api/boards/${board.id}`).set(auth(owner.token));
    assert.equal(await ShareLink.countDocuments(), 0);
  });

  it("shows owner and guest to each other", async () => {
    const ctx = await setup();
    const ownerSocket = await tab(ctx.owner.token);
    await emitAck(ownerSocket, "board:join", { boardId: ctx.board.id });
    const heard = waitFor(ownerSocket, "presence:joined");
    const guestSocket = await tab(ctx.guest.token);
    const reply = await emitAck(guestSocket, "board:join", { boardId: ctx.board.id });
    assert.equal(reply.ok, true);
    assert.equal(reply.role, "edit");
    assert.deepEqual(reply.peers.map((person) => person.name).sort(), ["Maya Joshi", "Sam"]);
    assert.equal((await heard).person.name, "Sam");
  });

  it("lets an edit guest change the board", async () => {
    const ctx = await setup("edit");
    const { ownerSocket, guestSocket } = await bothInRoom(ctx);
    const heard = waitFor(ownerSocket, "item:created");
    const reply = await emitAck(guestSocket, "item:create", { boardId: ctx.board.id, item: itemPayload({ text: "From a guest" }) });
    assert.equal(reply.ok, true);
    assert.equal((await heard).item.text, "From a guest");
    assert.equal(await Item.countDocuments(), 1);
  });

  it("lets a view guest watch but not change", async () => {
    const ctx = await setup("view");
    const { ownerSocket, guestSocket, reply } = await bothInRoom(ctx);
    assert.equal(reply.role, "view");
    const denied = await emitAck(guestSocket, "item:create", { boardId: ctx.board.id, item: itemPayload() });
    assert.equal(denied.ok, false);
    assert.equal(await Item.countDocuments(), 0);
    const seen = waitFor(guestSocket, "item:created");
    await emitAck(ownerSocket, "item:create", { boardId: ctx.board.id, item: itemPayload({ text: "Owner note" }) });
    assert.equal((await seen).item.text, "Owner note");
  });

  it("relays cursors between a view guest and the owner", async () => {
    const ctx = await setup("view");
    const { ownerSocket, guestSocket } = await bothInRoom(ctx);
    const heard = waitFor(ownerSocket, "cursor:moved");
    guestSocket.emit("cursor:move", { boardId: ctx.board.id, x: 10, y: 20 });
    assert.deepEqual(await heard, { personId: ctx.guest.guest.id, x: 10, y: 20 });
  });

  it("keeps a guest inside the board their link belongs to", async () => {
    const ctx = await setup();
    const second = await makeBoard(ctx.owner.token, "Private board");
    const guestSocket = await tab(ctx.guest.token);
    assert.equal((await emitAck(guestSocket, "board:join", { boardId: second.id })).ok, false);
    assert.equal((await emitAck(guestSocket, "board:join", { boardId: ctx.board.id })).ok, true);
  });

  it("disconnects a guest the moment the link is revoked", async () => {
    const ctx = await setup();
    const { ownerSocket, guestSocket } = await bothInRoom(ctx);
    const revoked = waitFor(guestSocket, "access:revoked");
    const left = waitFor(ownerSocket, "presence:left");
    await request(app).delete(`/api/boards/${ctx.board.id}/share/${ctx.link.id}`).set(auth(ctx.owner.token));
    await revoked;
    assert.equal((await left).personId, ctx.guest.guest.id);
    const retry = await tab(ctx.guest.token);
    assert.equal((await emitAck(retry, "board:join", { boardId: ctx.board.id })).ok, false);
  });

  it("stops edits from a guest whose link has expired", async () => {
    const ctx = await setup("edit");
    const { guestSocket } = await bothInRoom(ctx);
    await ShareLink.updateOne({ _id: ctx.link.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const reply = await emitAck(guestSocket, "item:create", { boardId: ctx.board.id, item: itemPayload() });
    assert.equal(reply.ok, false);
    assert.equal(await Item.countDocuments(), 0);
  });
});
