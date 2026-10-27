import test from "node:test";
import assert from "node:assert/strict";
import { createSyncAdapter } from "../sync.js";
import { emptyState, backup } from "../core.js";
function client(userId, result = { data: [], error: null }) {
  const calls = [];
  const query = {};
  for (const method of ["select", "eq", "insert", "update"])
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return query;
    };
  query.maybeSingle = async () => result;
  query.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return {
    calls,
    auth: {
      getUser: async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    from: (table) => {
      calls.push(["from", table]);
      return query;
    },
  };
}
test("disabled integration never makes network requests on construction", () => {
  const c = client(null);
  createSyncAdapter(c);
  assert.equal(c.calls.length, 0);
});
test("unauthenticated requests are rejected before any database call", async () => {
  const c = client(null),
    adapter = createSyncAdapter(c);
  await assert.rejects(() => adapter.pull(), /登录/);
  await assert.rejects(() => adapter.push(emptyState()), /登录/);
  assert.equal(c.calls.length, 0);
});
test("read and update are scoped to authenticated owner, with revision conflict protection", async () => {
  const c = client("synthetic-user-a", {
    data: { payload: backup(emptyState()), revision: 2 },
    error: null,
  });
  assert.equal((await createSyncAdapter(c).pull()).revision, 2);
  assert.ok(
    c.calls.some(
      (x) => x[0] === "eq" && x[1] === "user_id" && x[2] === "synthetic-user-a",
    ),
  );
  const u = client("synthetic-user-b", {
    data: [{ revision: 3 }],
    error: null,
  });
  assert.equal(await createSyncAdapter(u).push(emptyState(), 2), 3);
  assert.ok(
    u.calls.some((x) => x[0] === "eq" && x[1] === "revision" && x[2] === 2),
  );
  assert.ok(
    u.calls.some(
      (x) => x[0] === "eq" && x[1] === "user_id" && x[2] === "synthetic-user-b",
    ),
  );
});
test("stale updates fail explicitly instead of reporting success", async () => {
  await assert.rejects(
    () => createSyncAdapter(client("synthetic-user-a")).push(emptyState(), 3),
    /云端已变化/,
  );
});
