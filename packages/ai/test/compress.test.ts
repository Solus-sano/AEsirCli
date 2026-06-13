import test from "node:test";
import assert from "node:assert/strict";
import {
    estimateTokens,
    formatCompactSummary,
    getCompactPrompt,
} from "../src/compress.js";
import type { ChatMessage } from "../src/messages.js";

test("estimateTokens counts message content and tool call text", () => {
    const messages: ChatMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hello 世界" },
        {
            role: "assistant",
            content: null,
            reasoning_content: "Need a file",
            tool_calls: [
                {
                    id: "call_1",
                    type: "function",
                    function: { name: "read_file", arguments: "{\"path\":\"README.md\"}" },
                },
            ],
        },
    ];

    assert.equal(estimateTokens(messages), 30);
});

test("formatCompactSummary strips analysis and unwraps summary", () => {
    assert.equal(
        formatCompactSummary(
            "<analysis>scratchpad details</analysis>\n\n<summary>\nUseful summary\n</summary>",
        ),
        "Summary:\nUseful summary",
    );
});

test("getCompactPrompt includes custom instructions", () => {
    const prompt = getCompactPrompt("Preserve file paths exactly.");

    assert.match(prompt, /TEXT ONLY/);
    assert.match(prompt, /Additional Instructions:/);
    assert.match(prompt, /Preserve file paths exactly\./);
});
