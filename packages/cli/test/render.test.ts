import test from "node:test";
import assert from "node:assert/strict";
import { truncateToolOutput } from "../src/render.js";

test("truncateToolOutput returns short output unchanged", () => {
    assert.equal(truncateToolOutput("short output"), "short output");
});

test("truncateToolOutput truncates long output and includes original length", () => {
    const output = "x".repeat(2050);
    const truncated = truncateToolOutput(output);

    assert.equal(truncated.length, 2048 + "\n[Output truncated, total length: 2050]".length);
    assert.match(truncated, /^\x78{2048}\n\[Output truncated, total length: 2050\]$/);
});
