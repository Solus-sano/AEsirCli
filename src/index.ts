#!/usr/bin/env node

// import "dotenv/config";
import {runTurnStream} from "./agent.js";
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { ChatMessage } from "./messages.js";
import { registerTool, type Tool } from "./tools.js";
import { eventsToMessages, SessionManager } from "./session.js";
import { ifTooLong, compressMessages } from "./compress.js";



const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function read_file(args: unknown): Promise<string> {
    const path = (args as { path: string }).path;
    if (typeof path !== "string") {
        throw new Error("Path must be a string");
    }
    return await fs.readFile(path, "utf-8");
}

async function bash(args: unknown): Promise<string> {
    const command = (args as { command: string }).command;
    const TIMEOUT_MS = 10000;
    try {
        const { stdout, stderr } = await promisify(exec)(command as string, {timeout: TIMEOUT_MS}); // 10 seconds timeout
        return `[stdout]:${stdout}\n[stderr]:${stderr}`;
    } catch (error: unknown) {
        const e = error as {
            killed?: boolean;
            signal?: string;
            stdout?: string;
            stderr?: string;
            message?: string;
        }

        if (e.killed && e.signal === "SIGTERM") {
            return `Error: command timed out after ${TIMEOUT_MS / 1000}s and was killed.\n[stdout so far]:${e.stdout ?? ""}\n[stderr so far]:${e.stderr ?? ""}`;
        }
        return `Error: ${e.message ?? String(error)}\n[stdout]:${e.stdout ?? ""}\n[stderr]:${e.stderr ?? ""}`;
    }
}

const tmpTool: Tool[] = [
    {
        name: "read_file",
        description: "Read a file",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "The path to the file to read"
                }
            },
            required: ["path"]
        },
        run: read_file
    },
    {
        name: "bash",
        description: "Execute a bash command",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "The command to execute"
                }
            },
            required: ["command"]
        },
        run: bash
    }
]

tmpTool.forEach(tool => registerTool(tool));


async function main() {
    let messages: ChatMessage[] = [];// empty messages array
    const sessionManager = new SessionManager();

    let sessionId: string;

    // sessions list
    if (process.argv.includes("sessions")) {
        const sessions = await sessionManager.list();
        console.log("Sessions:");
        for (const session of sessions) {
            console.log(`- ${session.id} (${session.eventCount} events)`);
        }
        process.exit(0);
    }

    // fork <id>
    if (process.argv.includes("fork")) {
        const forkId = process.argv[process.argv.indexOf("fork") + 1];
        if (!forkId) {
            console.error("Error: fork requires a session ID");
            process.exit(1);
        }
        const events = await sessionManager.load(forkId);
        sessionId = (await sessionManager.create()).id;
        for (const event of events) {
            await sessionManager.append(sessionId, event);
        }

        messages = eventsToMessages(events);
        console.log(`\x1b[90m[Forked from session ${forkId} -> new session ${sessionId}]\x1b[0m`);
    } else if (process.argv.includes("--resume")) {
        const resumeId = process.argv[process.argv.indexOf("--resume") + 1];
        if (!resumeId) {
            console.error("Error: --resume requires a session ID");
            process.exit(1);
        }
        sessionId = resumeId;
        const events = await sessionManager.load(sessionId);
        messages = eventsToMessages(events);
        console.log(`\x1b[90m[Resuming session ${sessionId}, ${events.length} events loaded]\x1b[0m`);
    } else {
        sessionId = (await sessionManager.create()).id;
    }

    let currentController: AbortController | null = null;
    rl.on("SIGINT", () => {
        if (currentController) {
            currentController.abort();
            currentController = null;
        } else {
            console.log("\nGoodbye!");
            process.exit(0);
        }
    });

    while (true) {
        // 用绿色">"提示符等待输入一行
        const userInput: string = await rl.question('\x1b[32m>\x1b[0m ');
        if (userInput.trim() === ":exit") {
            rl.close();
            console.log(`\x1b[34m[Session: ${sessionId}]\x1b[0m`);
            console.log("\x1b[34m\nGoodbye!\x1b[0m");
       
            break;
        }

        // check if the messages are too long
        if (ifTooLong(messages)) {
            console.log("\x1b[90m[Messages are too long, compressing...]\x1b[0m");
            const compressUserMessages = await compressMessages(messages);

            const summaryContent = compressUserMessages[0]?.content ?? "";
            await sessionManager.append(sessionId, {
                type: "summary",
                content: summaryContent,
                timestamp: new Date().toISOString()
            });

            messages = compressUserMessages;
        }

        messages.push({role: "user", content: userInput});

        await sessionManager.append(sessionId, {
            type: "user_message",
            content: userInput,
            timestamp: new Date().toISOString()
        });
        currentController = new AbortController();
        const { signal } = currentController;
        try {
            const assistantMessage = await runTurnStream(
                messages,
                signal,
                (event) => sessionManager.append(sessionId, event)
            );
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                process.stdout.write('\n\x1b[31m[interrupted by user]\x1b[0m\n');
                continue
            }
            throw error;
        } finally {
            currentController = null
        }
    }
}

await main();