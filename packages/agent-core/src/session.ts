import type { ToolCall, ChatMessage } from "@aesir/ai";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";


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

// export type ToolCallEvent = {
//     type: "tool_call";
//     tool_call_id: string;
//     name: string;
//     arguments: string;
//     timestamp: string; // ISO 8601
// }

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

export type SystemMessageEvent = {
    type: "system_message";
    content: string;
    timestamp: string; // ISO 8601
}

export type SessionEvent = UserMessageEvent | AssistantMessageEvent | ToolResultEvent | SummaryEvent | SystemMessageEvent;


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


export function eventsToMessages(events: SessionEvent[]): ChatMessage[] {
    let messages: ChatMessage[] = [];
    for (const event of events) {
        if (event.type === "system_message") {
            messages.push({ role: "system", content: event.content });
        } else if (event.type === "user_message") {
            messages.push({ role: "user", content: event.content });
        } else if (event.type === "assistant_message") {
            if (event.tool_calls) {
                messages.push({ 
                    role: "assistant", 
                    content: event.content, 
                    tool_calls: event.tool_calls, 
                    reasoning_content: event.reasoning_content ?? "",
                    // finish_reason: event.finish_reason ?? null
                });
            } else {
                messages.push({ 
                    role: "assistant", 
                    content: event.content, 
                    reasoning_content: event.reasoning_content ?? "",
                    // finish_reason: event.finish_reason ?? null
                });
            }
        } else if (event.type === "tool_result") {
            messages.push({ role: "tool", content: event.content, tool_call_id: event.tool_call_id });
        } else if (event.type === "summary") {
            messages = [];
            messages.push({ role: "system", content: `The following is a summary of the conversation: ${event.content}` });
        }
    }
    return messages;
}

export class SessionManager {
    private sessionRootPath: string;
    // private events: SessionEvent[] = [];

    constructor() {
        // this.sessionRootPath = path.join(os.homedir(), ".config", "aesir-cli", "sessions");
        this.sessionRootPath = path.join(process.cwd(), ".cache", "aesir-cli", "sessions");
    }

    async create(): Promise<{ id: string; filePath: string }> {
        await fs.mkdir(this.sessionRootPath, { recursive: true });
        const id = Date.now().toString(36) + "-" + crypto.randomBytes(2).toString("hex");
        const filePath = path.join(this.sessionRootPath, id + ".jsonl");
        await fs.writeFile(filePath, "", "utf-8");
        return { id, filePath };
    }

    async list(): Promise<{ id: string; createAt: string; eventCount: number }[]> {
        try {
            const files = await fs.readdir(this.sessionRootPath);
            const eventCounts = await Promise.all(files
                .filter(file => file.endsWith(".jsonl"))
                .map(file => fs.readFile(path.join(this.sessionRootPath, file), "utf-8")
                    .then(content => content.split("\n").filter(line => line.trim() !== "").length)));
            let metadata: { id: string; createAt: string; eventCount: number }[] = [];
            for (let i = 0; i < files.length; i++) {
                const tmp_file = files[i];
                if (tmp_file) {
                    metadata.push({
                        id: tmp_file.split(".")[0] as string,
                        createAt: (await fs.stat(path.join(this.sessionRootPath, tmp_file))).birthtime.toISOString(),
                        eventCount: eventCounts[i] ?? 0
                    });
                }
            }
            return metadata;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
            }
            throw error;
        }
    }

    async load(id: string): Promise<SessionEvent[]> {
        try {
            const filePath = path.join(this.sessionRootPath, id + ".jsonl");
            const EnvList: SessionEvent[] = await readEventsFromFile(filePath);
            const lastEvent = EnvList[EnvList.length - 1];
            if (lastEvent && lastEvent.type === "user_message") {
                return EnvList.slice(0, -1);
            } else {
                return EnvList;
            }
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new Error(`Session "${id}" not found`);
            }
            throw error;
        }
    }

    async append(id: string, event: SessionEvent): Promise<void> {
        const filePath = path.join(this.sessionRootPath, id + ".jsonl");
        await appendEventToFile(filePath, event);
    }

    async getFilePath(id: string): Promise<string> {
        return path.join(this.sessionRootPath, id + ".jsonl");
    }
}
