import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSafePath } from "../src/tools/path-safety.js";

test("resolveSafePath allows paths inside the workspace", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "aesir-workspace-"));

    assert.equal(
        await resolveSafePath("src/index.ts", workspace),
        path.join(workspace, "src", "index.ts"),
    );
    assert.equal(await resolveSafePath(".", workspace), workspace);
});

test("resolveSafePath rejects parent traversal outside the workspace", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "aesir-workspace-"));

    await assert.rejects(
        () => resolveSafePath("../outside.txt", workspace),
        /outside workspace/,
    );
});

test("resolveSafePath rejects sibling paths that merely share a prefix", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "aesir-parent-"));
    const workspace = path.join(parent, "project");
    await fs.mkdir(workspace);

    await assert.rejects(
        () => resolveSafePath("../project-other/file.txt", workspace),
        /outside workspace/,
    );
});
