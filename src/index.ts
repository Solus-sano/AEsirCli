#!/usr/bin/env node

// import "dotenv/config";
import {runTurnStream} from "./agent.js";
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { ChatMessage } from "./messages.js";
import { registerTool, registry, type Tool } from "./tools.js";
import { eventsToMessages, SessionManager } from "./session.js";
import { ifTooLong, compressMessages } from "./compress.js";
import { resetRenderState } from "./render.js";
import type { ProviderInput } from "./providers/types.js";
import { resolveModel } from "./providers/registry.js";
import { getProvider } from "./providers/registry.js";
import { z } from "zod";
import { readFilesTool } from "./tools/read-files.js";
import { bashTool } from "./tools/bash.js";
import { writeFileTool } from "./tools/write-file.js";
import { editFileTool } from "./tools/edit-file.js";
import { globTool } from "./tools/glob.js";
import { grepTool } from "./tools/grep.js";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const tmpTool: Tool[] = [
    readFilesTool,
    bashTool,
    writeFileTool,
    editFileTool,
    globTool,
    grepTool
]

tmpTool.forEach(tool => registerTool(tool));

async function main() {
    let messages: ChatMessage[] = [];// empty messages array
    const sessionManager = new SessionManager();

    let sessionId: string;

    const modelArgIndex = process.argv.indexOf("--model");
    const modelName = modelArgIndex >= 0
        ? process.argv[modelArgIndex + 1]
        : process.env.MODEL;
    if (!modelName) {
        console.error("Error: set MODEL in .env or pass --model <name>");
        process.exit(1);
    }
    if (modelArgIndex >= 0 && !process.argv[modelArgIndex + 1]) {
        console.error("Error: --model requires a model name");
        process.exit(1);
    }

    const modelConfig = resolveModel(modelName);
    const LLMProvider = getProvider(modelConfig);

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
            const {messages: compressUserMessages} = await compressMessages(
                {
                    messages: messages,
                    tools: []
                },
                LLMProvider
            );

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
            const providerOutput = await runTurnStream(
                {
                    messages: messages,
                    tools: Object.values(registry),
                    signal: signal
                },
                LLMProvider,
                (event) => sessionManager.append(sessionId, event),
                true
            );
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                resetRenderState();
                process.stdout.write('\n\x1b[31m[interrupted by user]\x1b[0m\n');
                continue
            } else {
                console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
        } finally {
            currentController = null
        }
    }
}

await main();
