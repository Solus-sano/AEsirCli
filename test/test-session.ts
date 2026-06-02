import fs from "node:fs/promises";
import { appendEventToFile, readEventsFromFile } from "../src/session.js";
import {
    type SessionEvent,
} from "../src/session.js";


const testFilePath = "test/tmp/test-session.jsonl";
await fs.mkdir("test/tmp", { recursive: true });


const testUserMessageEvent: SessionEvent = {
    type: "user_message",
    content: "Hello, world!",
    timestamp: new Date().toISOString(),
};

const testAssistantMessageEvent: SessionEvent = {
    type: "assistant_message",
    content: "Hello, world!",
    tool_calls: [],
    reasoning_content: "I'm thinking...",
    timestamp: new Date().toISOString(),
}

const testToolCallEvent: SessionEvent = {
    type: "tool_call",
    tool_call_id: "123",
    name: "test",
    arguments: {},
    timestamp: new Date().toISOString(),
}

const testToolResultEvent: SessionEvent = {
    type: "tool_result",
    tool_call_id: "123",
    content: "Hello, world!",
    timestamp: new Date().toISOString(),
}

const testSummaryEvent: SessionEvent = {
    type: "summary",
    content: "Hello, world!",
    timestamp: new Date().toISOString(),
}


async function main() {
    await appendEventToFile(testFilePath, testUserMessageEvent);
    await appendEventToFile(testFilePath, testAssistantMessageEvent);
    await appendEventToFile(testFilePath, testToolCallEvent);
    await appendEventToFile(testFilePath, testToolResultEvent);
    await appendEventToFile(testFilePath, testSummaryEvent);
    const events = await readEventsFromFile(testFilePath);
    console.log(events);
}

await main();