#!/usr/bin/env node

import readline from "node:readline/promises";
import fs from "node:fs";

import type { ChatMessage, Provider } from "@aesir/ai";
import { resolveModel, getProvider, ifTooLong, compressMessages } from "@aesir/ai";
import {
    runTurnStream,
    registerTool,
    registry,
    eventsToMessages,
    SessionManager,
    loadProjectContext,
    readFilesTool,
    bashTool,
    writeFileTool,
    editFileTool,
    globTool,
    grepTool,
    type Tool,
    discoverExtensions,
    loadExtension,
    ExtensionRunner,
    registerBuiltinCommands,
    type RegisteredCommand,
    isSlashCommand,
    executeCommand,
} from "@aesir/agent-core";
import { printLLMStreamEvent, printLLMStreamEventOnlyText, resetRenderState } from "./render.js";
import { TUIApp } from "./tui/app.js";
import { Screen } from "./tui/screen.js";
import { onUserMessage } from "./tui/handler.js";
import { z } from "zod";
import path from "node:path";

const yoloMode = process.argv.includes("--yolo");
const noTUI = process.argv.includes("--no-tui");
const printMode = process.argv.includes("--print") || process.argv.includes("-p");
let printModeInput: string | undefined = undefined;
let rl: readline.Interface | null = null;

if (!printMode) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
} else {
    if (process.argv.includes("--print"))
        printModeInput = process.argv[process.argv.indexOf("--print") + 1];
    else
        printModeInput = process.argv[process.argv.indexOf("-p") + 1];
}

async function confirmToolCall(toolName: string, args: unknown): Promise<boolean> {
    if (yoloMode || printMode) {
        return true;
    }

    const argsText = JSON.stringify(args, null, 2);
    const answer = await rl!.question(
        `\x1b[33mAllow tool call ${toolName} with arguments:\n${argsText}\nProceed? [y/N]\x1b[0m `
    );
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
}

const tmpTool: Tool[] = [
    readFilesTool,
    bashTool,
    writeFileTool,
    editFileTool,
    globTool,
    grepTool
]

tmpTool.forEach(tool => registerTool(tool));


async function baseCli(
    messages: ChatMessage[], 
    sessionManager: SessionManager, 
    sessionId: string, 
    LLMProvider: Provider,
    extensionRunner?: ExtensionRunner,
    extensionCommands?: Map<string, RegisteredCommand>,
): Promise<void> {
    let currentController: AbortController | null = null;
    rl!.on("SIGINT", () => {
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
        const userInput: string = await rl!.question('\x1b[32m>\x1b[0m ');
        if (userInput.trim() === ":exit") {
            rl!.close();
            console.log(`\x1b[34m[Session: ${sessionId}]\x1b[0m`);
            console.log("\x1b[34m\nGoodbye!\x1b[0m");
       
            break;
        }
        if (isSlashCommand(userInput)) {
            const result = await executeCommand(userInput, extensionCommands ?? new Map());
            if (result) {
                console.log(result);
            }
            continue;
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
                extensionRunner,
                (event) => sessionManager.append(sessionId, event),
                printLLMStreamEvent,
                confirmToolCall,
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

async function printModeCli(
    messages: ChatMessage[], 
    sessionManager: SessionManager, 
    sessionId: string, 
    LLMProvider: Provider,
    extensionRunner?: ExtensionRunner,
    extensionCommands?: Map<string, RegisteredCommand>,
): Promise<void> {
    let currentController: AbortController | null = null;

    const inputStr = messages[messages.length - 1]?.content ?? "";
    if (isSlashCommand(inputStr)) {
        const result = await executeCommand(inputStr, extensionCommands ?? new Map());
        if (result) {
            process.stdout.write(result);
            return;
        }
    }   

    // check if the messages are too long
    if (ifTooLong(messages)) {
        process.stdout.write("[Messages are too long, compressing...]");
        return;
    }

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
            extensionRunner,
            (event) => sessionManager.append(sessionId, event),
            printLLMStreamEventOnlyText,
            confirmToolCall,
        );
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            resetRenderState();
            process.stdout.write('\n\x1b[31m[interrupted by user]\x1b[0m\n');
            return;
        } else {
            process.stdout.write(`Error: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
    } finally {
        currentController = null
    }
}

async function main() {
    if (yoloMode) {
        console.warn("\x1b[31m⚠ Running in yolo mode — all tool calls will be auto-approved\x1b[0m");
    }

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

    // load extensions — find workspace root by walking up to pnpm-workspace.yaml
    let workspaceRoot = process.cwd();
    while (workspaceRoot !== path.dirname(workspaceRoot)) {
        if (fs.existsSync(path.join(workspaceRoot, "pnpm-workspace.yaml"))) break;
        workspaceRoot = path.dirname(workspaceRoot);
    }
    const extensionDir = path.join(workspaceRoot, ".aesir", "extensions");
    const extensionPath = discoverExtensions(extensionDir);
    const { extensions, errors } = await loadExtension(extensionPath);
    for (const extension of extensions) {
        for (const [_, tool] of extension.tools) {
            registerTool(tool);
        }
    }
    for (const error of errors) {
        console.warn(`\x1b[33m[Error: ${error}]\x1b[0m`);
    }
    const extensionRunner = new ExtensionRunner(extensions);


    // load extension commands
    const extensionCommands = new Map<string, RegisteredCommand>();
    registerBuiltinCommands(extensionCommands);
    for (const ext of extensions) {
        for (const [name, cmd] of ext.commands) {
            extensionCommands.set(name, cmd);
        }
    }

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
        const projectContext = await loadProjectContext(process.cwd());
        if (projectContext) {
            messages.unshift({ role: "system", content: projectContext });
            await sessionManager.append(sessionId, {
                type: "system_message",
                content: projectContext,
                timestamp: new Date().toISOString()
            });
            console.log("[Loaded project context from CLAUDE.md]");
        }
    }

    await extensionRunner?.emit({ type: "session_start" });
    if (printMode) {
        messages.push({role: "user", content: printModeInput ?? ""});
        await printModeCli(messages, sessionManager, sessionId, LLMProvider, extensionRunner, extensionCommands);
    }
    else if (noTUI) {
        await baseCli(messages, sessionManager, sessionId, LLMProvider, extensionRunner, extensionCommands);
    } else {
        const screen = new Screen();
        const tui = new TUIApp(screen, sessionManager, sessionId, LLMProvider, {
            modelName: modelName,
            onUserMessage,
        });
        tui.start();
    }

    
}

await main();
