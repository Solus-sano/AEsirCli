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
    while (true) {
        // 用绿色">"提示符等待输入一行
        const userInput: string = await rl.question('\x1b[32m>\x1b[0m ');
        if (userInput.trim() === ":exit") {
            rl.close();
            console.log("\nGoodbye!");
            break;
        }

        messages.push({role: "user", content: userInput});

        // let completeContent = "";
        // for await (const event of chatStream(messages)) {
        //     if (event.type === "text-delta") {
        //         completeContent += event.text;
        //         process.stdout.write(event.text);
        //     }
        //     if (event.type === "done") {
        //         process.stdout.write("\n");
        //     }
        //     if (event.type === "usage") {
        //         Usage.prompt_tokens += event.usage.prompt_tokens;
        //         Usage.completion_tokens += event.usage.completion_tokens;
        //         Usage.total_tokens += event.usage.total_tokens;
        //         Usage.cache_tokens += event.usage.cache_tokens || 0;
        //     }
        // }
        // messages.push({role: "assistant", content: completeContent});
        // console.log(`\x1b[34mUsage: ${JSON.stringify(Usage, null, 2)}\x1b[0m`);
        const assistantMessage = await runTurnStream(messages);
        messages.push(assistantMessage);
        // console.log(JSON.stringify(assistantMessage, null, 2));

        // catch ctrl + c
    }
}

await main();