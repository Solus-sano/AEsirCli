#!/usr/bin/env node

// import "dotenv/config";
import {chatSingle, chatStream, runTurn, runTurnStream} from "./llm.js";
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { ChatMessage } from "./llm.js";
import { registerTool, type Tool } from "./tools.js";



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
    const messages: ChatMessage[] = [];// empty messages array
    
    let Usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cache_tokens: number;
    } = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cache_tokens: 0,
    };
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
            console.log("\nGoodbye!");
            break;
        }

        messages.push({role: "user", content: userInput});
        
        currentController = new AbortController();
        const { signal } = currentController;
        try {
            const assistantMessage = await runTurnStream(messages, signal);
            messages.push(assistantMessage);
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