import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import request from "supertest";
import Board from "../src/models/Board.js";
import Item from "../src/models/Item.js";
import User from "../src/models/User.js";
import { createItemSchema } from "../src/schemas.js";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "../src/seedDemo.js";
import { app, resetDb, startDb, stopDb } from "./helpers.js";

describe("demo seed", () => {
  before(startDb);
  after(stopDb);
  beforeEach(resetDb);

  it("creates a demo account, a filled board and a working guest link", async () => {
    const result = await seedDemo();
    assert.equal(result.created, true);
    assert.equal(await Item.countDocuments({ board: result.board._id }), 10);
    const login = await request(app).post("/api/auth/login").send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    assert.equal(login.status, 200);
    const invite = await request(app).get(`/api/share/${result.shareToken}`);
    assert.equal(invite.body.role, "edit");
  });

  it("does nothing the second time and rebuilds cleanly with reset", async () => {
    await seedDemo();
    assert.equal((await seedDemo()).created, false);
    assert.equal(await Item.countDocuments(), 10);
    const rebuilt = await seedDemo({ reset: true });
    assert.equal(rebuilt.created, true);
    assert.equal(await Item.countDocuments(), 10);
    assert.equal(await Board.countDocuments(), 1);
    assert.equal(await User.countDocuments(), 1);
  });

  it("only creates items that the API itself would accept", async () => {
    await seedDemo();
    for (const item of await Item.find().lean()) {
      const { type, x, y, w, h, color, rotate, text, domain, layer } = item;
      assert.doesNotThrow(() => createItemSchema.parse({ type, x, y, w, h, color, rotate, text, domain, layer }), text);
    }
  });
});
