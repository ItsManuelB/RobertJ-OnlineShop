import assert from "node:assert/strict";
import { test } from "node:test";

import { getProfileCompleteness } from "../src/features/account/utils/profile-completeness.ts";

const FULL = { fullName: "Mia Santos", phone: "0917", dateOfBirth: "1996-03-14", gender: "female", avatarUrl: "https://x/y.png" };

test("a full profile is 100%", () => {
  assert.deepEqual(getProfileCompleteness(FULL), { done: 5, total: 5, percent: 100, missing: [] });
});

test("empty and whitespace fields are listed as missing", () => {
  const result = getProfileCompleteness({ ...FULL, phone: "  ", avatarUrl: null });
  assert.equal(result.percent, 60);
  assert.deepEqual(result.missing, ["phone number", "photo"]);
});
