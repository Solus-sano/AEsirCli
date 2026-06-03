import fs from "node:fs/promises";
import process from "node:process";
import {
    appendEventToFile,
    readEventsFromFile,
    eventsToMessages,
    type SessionEvent,
} from "../src/session.js";
import type { ChatMessage } from "../src/llm.js";

const TS = "2026-06-04T00:00:00.000Z";
const testFilePath = "test/tmp/test-session.jsonl";

let passed = 0;

function assert(condition: boolean, message: string): void {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
    passed++;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        console.error(`FAIL: ${label}`);
        console.error("  expected:", expectedStr);
        console.error("  actual:  ", actualStr);
        process.exit(1);
    }
    passed++;
}

const testUserMessageEvent: SessionEvent = {
    type: "user_message",
    content: "Hello, world!",
    timestamp: TS,
};

const testAssistantMessageEvent: SessionEvent = {
    type: "assistant_message",
    content: "Hello, world!",
    tool_calls: [],
    reasoning_content: "I'm thinking...",
    timestamp: TS,
};

const testToolResultEvent: SessionEvent = {
    type: "tool_result",
    tool_call_id: "123",
    content: "Hello, world!",
    timestamp: TS,
};

const testSummaryEvent: SessionEvent = {
    type: "summary",
    content: "Prior conversation about greetings.",
    timestamp: TS,
};

async function testFilePersistence(): Promise<void> {
    await fs.mkdir("test/tmp", { recursive: true });
    await fs.rm(testFilePath, { force: true });

    await appendEventToFile(testFilePath, testUserMessageEvent);
    await appendEventToFile(testFilePath, testAssistantMessageEvent);
    await appendEventToFile(testFilePath, testToolResultEvent);
    await appendEventToFile(testFilePath, testSummaryEvent);

    const events = await readEventsFromFile(testFilePath);
    assertEqual(events.length, 4, "readEventsFromFile should return all appended events");
    assertEqual(events[0], testUserMessageEvent, "first event round-trips");
    assertEqual(events[3], testSummaryEvent, "summary event round-trips");
}

function testEventsToMessagesGeneralConversation(): void {
    const toolCall = {
        id: "call_abc",
        type: "function" as const,
        function: { name: "read_file", arguments: '{"path":"a.txt"}' },
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

    assertEqual(eventsToMessages(events), expected, "general conversation maps all event types");
}

function testEventsToMessagesSummaryClearsPriorEvents(): void {
    const events: SessionEvent[] = [
        { type: "user_message", content: "old question", timestamp: TS },
        {
            type: "assistant_message",
            content: "old answer",
            reasoning_content: "old thought",
            timestamp: TS,
        },
        {
            type: "tool_result",
            tool_call_id: "old_call",
            content: "old tool output",
            timestamp: TS,
        },
        {
            type: "summary",
            content: "User greeted the assistant; assistant replied.",
            timestamp: TS,
        },
        { type: "user_message", content: "new question", timestamp: TS },
        {
            type: "assistant_message",
            content: "new answer",
            reasoning_content: "new thought",
            finish_reason: "stop",
            timestamp: TS,
        },
    ];

    const messages = eventsToMessages(events);

    assert(
        !messages.some((m) => m.role === "user" && m.content === "old question"),
        "user_message before summary should not appear",
    );
    assert(
        !messages.some((m) => m.role === "assistant" && m.content === "old answer"),
        "assistant_message before summary should not appear",
    );
    assert(
        !messages.some((m) => m.role === "tool" && m.tool_call_id === "old_call"),
        "tool_result before summary should not appear",
    );

    const expected: ChatMessage[] = [
        {
            role: "system",
            content:
                "The following is a summary of the conversation: User greeted the assistant; assistant replied.",
        },
        { role: "user", content: "new question" },
        {
            role: "assistant",
            content: "new answer",
            reasoning_content: "new thought",
        },
    ];

    assertEqual(messages, expected, "after summary only system summary and subsequent events remain");
}

function testEventsToMessagesMultipleSummaries(): void {
    const events: SessionEvent[] = [
        { type: "user_message", content: "first", timestamp: TS },
        { type: "summary", content: "summary A", timestamp: TS },
        { type: "user_message", content: "second", timestamp: TS },
        { type: "summary", content: "summary B", timestamp: TS },
        { type: "user_message", content: "third", timestamp: TS },
    ];

    const messages = eventsToMessages(events);

    assertEqual(messages, [
        { role: "system", content: "The following is a summary of the conversation: summary B" },
        { role: "user", content: "third" },
    ], "later summary replaces earlier context including prior summary");
}

async function main(): Promise<void> {
    await testFilePersistence();
    testEventsToMessagesGeneralConversation();
    testEventsToMessagesSummaryClearsPriorEvents();
    testEventsToMessagesMultipleSummaries();

    console.log(`All session tests passed (${passed} assertions).`);
}

await main();
