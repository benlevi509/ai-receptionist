import test from "node:test";
import assert from "node:assert/strict";

import {
  normaliseName,
  normalisePeople,
  normaliseTime
} from "./normalizers.js";

test("understands natural British time phrases", () => {
  assert.deepEqual(normaliseTime("five past nine this evening"), {
    time: "9:05 PM",
    ambiguous: false
  });

  assert.deepEqual(normaliseTime("quarter to eight"), {
    time: "7:45 PM",
    ambiguous: false
  });

  assert.deepEqual(normaliseTime("half nine tonight"), {
    time: "9:30 PM",
    ambiguous: false
  });

  assert.deepEqual(normaliseTime("21:05"), {
    time: "9:05 PM",
    ambiguous: false
  });
});

test("defaults restaurant times without AM or PM to PM", () => {
  assert.deepEqual(normaliseTime("2:30"), {
    time: "2:30 PM",
    ambiguous: false
  });

  assert.deepEqual(normaliseTime("five past nine"), {
    time: "9:05 PM",
    ambiguous: false
  });

  assert.deepEqual(normaliseTime("2:30 am"), {
    time: "2:30 AM",
    ambiguous: false
  });
});

test("understands natural party sizes and booking names", () => {
  assert.equal(normalisePeople("there will be four of us"), 4);
  assert.equal(normaliseName("put it under ben levi"), "Ben Levi");
});
