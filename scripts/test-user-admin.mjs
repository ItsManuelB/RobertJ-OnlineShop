/**
 * Unit tests for the admin Users list helpers.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-user-admin.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isUnassignedSeller,
  isUserState,
  matchesUserState,
  summarizeUsers,
} from "../src/features/users/utils/user-admin.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-27T12:00:00Z");
const ago = (days) => new Date(now - days * DAY).toISOString();
const user = (role, extra = {}) => ({ role, isActive: true, shopId: null, createdAt: ago(30), ...extra });

const users = [
  user("buyer"),
  user("buyer", { isActive: false }),
  user("buyer", { createdAt: ago(2) }),
  user("seller"),
  user("seller", { shopId: "s1" }),
  user("admin"),
];

test("only a seller without a shop is unassigned", () => {
  assert.equal(isUnassignedSeller(user("seller")), true);
  assert.equal(isUnassignedSeller(user("seller", { shopId: "s1" })), false);
  assert.equal(isUnassignedSeller(user("buyer")), false);
});

test("summary counts roles and the attention groups", () => {
  assert.deepEqual(summarizeUsers(users, now), {
    total: 6,
    buyer: 3,
    seller: 2,
    admin: 1,
    unassignedSellers: 1,
    inactive: 1,
    newThisWeek: 1,
  });
  assert.equal(summarizeUsers([], now).total, 0);
});

test("state matching and validation", () => {
  assert.equal(matchesUserState(user("buyer", { isActive: false }), "inactive", now), true);
  assert.equal(matchesUserState(user("buyer"), "inactive", now), false);
  assert.equal(matchesUserState(user("buyer", { createdAt: ago(6.9) }), "new", now), true);
  assert.equal(matchesUserState(user("buyer", { createdAt: ago(7.5) }), "new", now), false);
  assert.equal(isUserState("unassigned"), true);
  assert.equal(isUserState("bogus"), false);
  assert.equal(isUserState(null), false);
});
