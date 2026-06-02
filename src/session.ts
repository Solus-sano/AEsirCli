import type { ToolCall } from "./llm.js";
import fs from "node:fs/promises";


export type UserMessageEvent = {
    type: "user_message";
    content: string;
    timestamp: string; // ISO 8601
}

export type AssistantMessageEvent = {
    type: "assistant_message";
    content: string | null;
    tool_calls?: ToolCall[];
    reasoning_content?: string;
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cache_tokens: number; };
    timestamp: string; // ISO 8601
}

export type ToolCallEvent = {
    type: "tool_call";
    tool_call_id: string;
    name: string;
    arguments: unknown;
    timestamp: string; // ISO 8601
}

export type ToolResultEvent = {

    type: "tool_result";
    tool_call_id: string;
    content: string;
    timestamp: string; // ISO 8601
}

export type SummaryEvent = {
    type: "summary";
    content: string;
    timestamp: string; // ISO 8601
}

export type SessionEvent = UserMessageEvent | AssistantMessageEvent | ToolCallEvent | ToolResultEvent | SummaryEvent;


export async function appendEventToFile(filePath: string, event: SessionEvent): Promise<void> {
    return fs.appendFile(filePath, JSON.stringify(event) + "\n", "utf-8");
}

export async function readEventsFromFile(filePath: string): Promise<SessionEvent[]> {
    const content = await fs.readFile(filePath, "utf-8");
    return content.split("\n")
        .map(line => line.trim())
        .filter(line => line !== "")
        .map(
            line => {
                try {
                    return JSON.parse(line);
                } catch (error) {
                    console.error(`Error parsing line: ${line}`);
                    return null;
                }
            }
        )
        .filter(event => event !== null)
        .map(event => event as SessionEvent);
}
