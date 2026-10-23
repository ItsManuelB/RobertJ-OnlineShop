/**
 * Unit tests for the Seller Dashboard's "Needs your attention" builder.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-seller-tasks.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildSellerTasks, summarizeSellerTasks } from "../src/features/seller/utils/seller-tasks.ts";

const routes = { orders: "/seller/orders", returns: "/seller/returns", inventory: "/seller/inventory" };
const zero = {
  needsConfirmation: 0,
  codAwaitingCollection: 0,
  pendingReturnRequests: 0,
  returnsDueSoon: 0,
  returnsAwaitingReceipt: 0,
  returnsAwaitingRestock: 0,
  toPrepare: 0,
  inProcessing: 0,
  overdueToShip: 0,
  codAwaitingCents: 0,
  outOfStock: 0,
  lowStock: 0,
};

test("no counts means no tasks and an all-clear summary", () => {
  const tasks = buildSellerTasks(zero, routes);
  assert.deepEqual(tasks, []);
  assert.equal(summarizeSellerTasks(tasks), "All caught up");
});

test("only tasks with a count are returned, in priority order", () => {
  const tasks = buildSellerTasks({ ...zero, lowStock: 2, needsConfirmation: 3, pendingReturnRequests: 1 }, routes);
  assert.deepEqual(tasks.map((t) => t.id), ["confirm-orders", "return-requests", "restock"]);
  assert.equal(tasks[0].href, "/seller/orders?confirmationRequired=true");
});

test("return deadline shows only when a request is due soon", () => {
  const calm = buildSellerTasks({ ...zero, pendingReturnRequests: 2 }, routes)[0];
  assert.equal(calm.urgent, null);
  const urgent = buildSellerTasks({ ...zero, pendingReturnRequests: 2, returnsDueSoon: 1 }, routes)[0];
  assert.equal(urgent.urgent, "1 request due within 24 hours or overdue");
  assert.equal(urgent.href, "/seller/returns?tab=action");
});

test("fulfilment and stock links pick the filter that has work", () => {
  const onlyProcessing = buildSellerTasks({ ...zero, inProcessing: 4 }, routes)[0];
  assert.equal(onlyProcessing.count, 4);
  assert.equal(onlyProcessing.href, "/seller/orders?status=processing");
  const onlyLow = buildSellerTasks({ ...zero, lowStock: 3 }, routes)[0];
  assert.equal(onlyLow.href, "/seller/inventory?stockStatus=low_stock");
  const withOut = buildSellerTasks({ ...zero, lowStock: 3, outOfStock: 1 }, routes)[0];
  assert.equal(withOut.count, 4);
  assert.equal(withOut.href, "/seller/inventory?stockStatus=out_of_stock");
});

test("summary lists the first three tasks and counts the rest", () => {
  const tasks = buildSellerTasks(
    { ...zero, needsConfirmation: 1, pendingReturnRequests: 2, toPrepare: 3, codAwaitingCollection: 4, lowStock: 5 },
    routes,
  );
  assert.equal(
    summarizeSellerTasks(tasks),
    "1 confirm new orders · 2 respond to return requests · 3 prepare and ship · +2 more",
  );
});

test("overdue orders turn Prepare and ship red with a warning line", () => {
  const calm = buildSellerTasks({ ...zero, toPrepare: 2 }, routes)[0];
  assert.equal(calm.tone, "info");
  assert.equal(calm.urgent, null);
  const late = buildSellerTasks({ ...zero, toPrepare: 2, overdueToShip: 1 }, routes)[0];
  assert.equal(late.tone, "danger");
  assert.match(late.urgent, /1 order waiting more than 2 days/);
});

test("COD task shows the cash amount to collect", () => {
  const task = buildSellerTasks({ ...zero, codAwaitingCollection: 2, codAwaitingCents: 125050 }, routes)[0];
  assert.match(task.detail, /₱1,250\.50 in cash to collect from 2 orders/);
});
