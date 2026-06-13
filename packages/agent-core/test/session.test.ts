import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    appendEventToFile,
    eventsToMessages,
    readEventsFromFile,
    type SessionEvent,
} from "../src/session.js";
import type { ChatMessage, ToolCall } from "@aesir/ai";

const TS = "2026-06-04T00:00:00.000Z";

test("session events round-trip through jsonl", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aesir-session-"));
    const filePath = path.join(dir, "session.jsonl");

    const events: SessionEvent[] = [
        { type: "user_message", content: "Hello", timestamp: TS },
        {
            type: "assistant_message",
            content: "Hi",
            tool_calls: [],
            reasoning_content: "Greeting back",
            finish_reason: "stop",
            timestamp: TS,
        },
        {
            type: "tool_result",
            tool_call_id: "call_1",
            content: "tool output",
            timestamp: TS,
        },
    ];

    for (const event of events) {
        await appendEventToFile(filePath, event);
    }

    assert.deepEqual(await readEventsFromFile(filePath), events);
});

test("readEventsFromFile skips malformed jsonl lines", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aesir-session-"));
    const filePath = path.join(dir, "broken-session.jsonl");
    const event: SessionEvent = { type: "user_message", content: "after bad line", timestamp: TS };

    await fs.writeFile(
        filePath,
        [
            JSON.stringify({ type: "user_message", content: "before bad line", timestamp: TS }),
            "{not json",
            JSON.stringify(event),
            "",
        ].join("\n"),
        "utf-8",
    );

    const originalError = console.error;
    console.error = () => {};
    try {
        assert.deepEqual(await readEventsFromFile(filePath), [
            { type: "user_message", content: "before bad line", timestamp: TS },
            event,
        ]);
    } finally {
        console.error = originalError;
    }
});

test("eventsToMessages maps tool calls and tool results", () => {
    const toolCall: ToolCall = {
        id: "call_abc",
        type: "function",
        function: { name: "read_file", arguments: "{\"path\":\"a.txt\"}" },
    };

    const events: SessionEvent[] = [
        { type: "user_message", content: "Read a.txt", timestamp: TS },
        {
            type: "assistant_message",
            content: null,
            tool_calls: [toolCall],
            reasoning_content: "Need to read the file",
            finish_reason: "tool_calls",
            timestamp: TS,
        },
        {
            type: "tool_result",
            tool_call_id: "call_abc",
            content: "file contents",
            timestamp: TS,
        },
        {
            type: "assistant_message",
            content: "The file says: file contents",
            reasoning_content: "",
            finish_reason: "stop",
            timestamp: TS,
        },
    ];

    const expected: ChatMessage[] = [
        { role: "user", content: "Read a.txt" },
        {
            role: "assistant",
            content: null,
            tool_calls: [toolCall],
            reasoning_content: "Need to read the file",
        },
        { role: "tool", content: "file contents", tool_call_id: "call_abc" },
        {
            role: "assistant",
            content: "The file says: file contents",
            reasoning_content: "",
        },
    ];

    assert.deepEqual(eventsToMessages(events), expected);
});

test("eventsToMessages keeps only the latest summary context and later events", () => {
    const events: SessionEvent[] = [
        { type: "user_message", content: "old question", timestamp: TS },
        { type: "summary", content: "summary A", timestamp: TS },
        { type: "user_message", content: "middle question", timestamp: TS },
        { type: "summary", content: "summary B", timestamp: TS },
        { type: "user_message", content: "new question", timestamp: TS },
    ];

    assert.deepEqual(eventsToMessages(events), [
        {
            role: "system",
            content: "The following is a summary of the conversation: summary B",
        },
        { role: "user", content: "new question" },
    ]);
});
