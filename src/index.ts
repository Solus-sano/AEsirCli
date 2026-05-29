#!/usr/bin/env node

// import "dotenv/config";
import {chatSingle, runTurn} from "./llm.js";
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
    const { stdout, stderr } = await promisify(exec)(command as string);
    return `[stdout]:${stdout}\n[stderr]:${stderr}`;
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
// registerTool(tmpTool[0]);


async function main() {
    const messages: ChatMessage[] = [];// empty messages array
    // const r = await chat([{role: "user", content: "Hello, I'm Æsir"}]);
    while (true) {
        // 用绿色">"提示符等待输入一行
        const userInput: string = await rl.question('\x1b[32m>\x1b[0m ');
        if (userInput.trim() === ":exit") {
            rl.close();
            console.log("\nGoodbye!");
            break;
        }

        messages.push({role: "user", content: userInput});
        const assistantMessage = await runTurn(messages);
        messages.push(assistantMessage);
        console.log(JSON.stringify(assistantMessage, null, 2));

        // catch ctrl + c
    }
}

await main();