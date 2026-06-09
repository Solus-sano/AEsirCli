import { promisify } from "node:util";
import type { Tool } from "../tools.js"
import { z } from "zod";
import { exec } from "node:child_process";



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

export const bashTool: Tool = {
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
    schema: z.object({
        command: z.string()
    }),
    run: bash
}
