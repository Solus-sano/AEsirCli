import { spawn } from "node:child_process";
import type { Tool } from "../tools.js";
import { z } from "zod";
import { resolveSafePath } from "./path-safety.js";

const outputModes = ["content", "files_with_matches", "count"] as const;
type OutputMode = (typeof outputModes)[number];

type GrepArgs = {
    pattern: string;
    path: string;
    cwd: string;
    outputMode: OutputMode;
    type?: string | string[];
    glob?: string | string[];
    ignoreCase?: boolean;
    fixedStrings?: boolean;
    wordRegexp?: boolean;
    context?: number;
    beforeContext?: number;
    afterContext?: number;
    multiline?: boolean;
    multilineDotall?: boolean;
    maxCount?: number;
    hidden?: boolean;
    noIgnore?: boolean;
};

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_COUNT = 1000;
const MAX_OUTPUT_BYTES = 200_000;

function pushRepeatedFlag(args: string[], flag: string, value?: string | string[]) {
    if (value === undefined) return;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
        if (item.trim().length > 0) args.push(flag, item);
    }
}

function buildRipgrepArgs(args: GrepArgs): string[] {
    const rgArgs = ["--color=never"];

    if (args.outputMode === "content") {
        rgArgs.push("--line-number", "--with-filename");
    } else if (args.outputMode === "files_with_matches") {
        rgArgs.push("--files-with-matches");
    } else {
        rgArgs.push("--count", "--with-filename");
    }

    if (args.ignoreCase) rgArgs.push("--ignore-case");
    if (args.fixedStrings) rgArgs.push("--fixed-strings");
    if (args.wordRegexp) rgArgs.push("--word-regexp");
    if (args.multiline) rgArgs.push("--multiline");
    if (args.multilineDotall) rgArgs.push("--multiline-dotall");
    if (args.hidden) rgArgs.push("--hidden");
    if (args.noIgnore) rgArgs.push("--no-ignore");

    pushRepeatedFlag(rgArgs, "--type", args.type);
    pushRepeatedFlag(rgArgs, "--glob", args.glob);

    if (args.outputMode === "content") {
        if (args.context !== undefined) {
            rgArgs.push("--context", String(args.context));
        } else {
            if (args.beforeContext !== undefined) rgArgs.push("--before-context", String(args.beforeContext));
            if (args.afterContext !== undefined) rgArgs.push("--after-context", String(args.afterContext));
        }
        rgArgs.push("--max-count", String(args.maxCount ?? DEFAULT_MAX_COUNT));
    }

    rgArgs.push("--", args.pattern, args.path);
    return rgArgs;
}

function truncateOutput(output: string): string {
    const buffer = Buffer.from(output, "utf-8");
    if (buffer.byteLength <= MAX_OUTPUT_BYTES) return output;
    return `${buffer.subarray(0, MAX_OUTPUT_BYTES).toString("utf-8")}\n\n[Output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
}

async function grep(rawArgs: unknown): Promise<string> {
    const args = rawArgs as GrepArgs;
    const safePath = await resolveSafePath(args.path, args.cwd);
    const rgArgs = buildRipgrepArgs(args);

    return await new Promise((resolve) => {
        const child = spawn("rg", rgArgs, {
            cwd: args.cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const finish = (message: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(message);
        };

        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            finish(`Error: grep timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`);
        }, DEFAULT_TIMEOUT_MS);

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf-8");
            if (Buffer.byteLength(stdout, "utf-8") > MAX_OUTPUT_BYTES && args.outputMode === "content") {
                child.kill("SIGTERM");
            }
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf-8");
        });
        child.on("error", (error) => {
            finish(`Error: failed to run ripgrep (rg): ${error.message}`);
        });
        child.on("close", (code, signal) => {
            if (settled) return;

            const trimmedStdout = truncateOutput(stdout).trimEnd();
            const trimmedStderr = stderr.trimEnd();

            if (signal === "SIGTERM" && args.outputMode === "content" && stdout.length > 0) {
                finish(truncateOutput(stdout).trimEnd());
                return;
            }

            if (code === 1) {
                finish("No matches found");
                return;
            }

            if (code !== 0) {
                finish(`Error: ripgrep exited with code ${code}${trimmedStderr ? `\n[stderr]:${trimmedStderr}` : ""}`);
                return;
            }

            finish(trimmedStdout || "No matches found");
        });
    });
}

export const grepTool: Tool = {
    name: "grep",
    description: "Search file contents with ripgrep (rg). Supports regex, file type filters, context lines, multiline matching, and output modes: content, files_with_matches, count.",
    parameters: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "Search pattern. Treated as a regular expression unless fixedStrings is true."
            },
            path: {
                type: "string",
                description: "File or directory to search. Default is current directory."
            },
            cwd: {
                type: "string",
                description: "Working directory for ripgrep. Default is the current process working directory."
            },
            outputMode: {
                type: "string",
                enum: outputModes,
                description: "Output mode: content shows matching lines, files_with_matches shows only paths, count shows per-file matching line counts."
            },
            type: {
                description: "ripgrep file type filter, e.g. 'ts', 'js', 'py'. Can be a string or array.",
                oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
            },
            glob: {
                description: "Glob filter passed to rg --glob, e.g. '*.ts' or '!*.test.ts'. Can be a string or array.",
                oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
            },
            ignoreCase: {
                type: "boolean",
                description: "Case-insensitive search."
            },
            fixedStrings: {
                type: "boolean",
                description: "Treat pattern as a literal string instead of a regex."
            },
            wordRegexp: {
                type: "boolean",
                description: "Only match whole words."
            },
            context: {
                type: "number",
                description: "Number of lines to show before and after each match in content mode."
            },
            beforeContext: {
                type: "number",
                description: "Number of lines before each match in content mode. Ignored when context is set."
            },
            afterContext: {
                type: "number",
                description: "Number of lines after each match in content mode. Ignored when context is set."
            },
            multiline: {
                type: "boolean",
                description: "Enable ripgrep multiline matching."
            },
            multilineDotall: {
                type: "boolean",
                description: "Make '.' match line terminators in multiline mode."
            },
            maxCount: {
                type: "number",
                description: `Maximum matching lines per file in content mode. Default is ${DEFAULT_MAX_COUNT}.`
            },
            hidden: {
                type: "boolean",
                description: "Search hidden files and directories."
            },
            noIgnore: {
                type: "boolean",
                description: "Do not respect ignore files such as .gitignore."
            }
        },
        required: ["pattern"]
    },
    schema: z.object({
        pattern: z.string(),
        path: z.string().optional().default("."),
        cwd: z.string().optional().default(process.cwd()),
        outputMode: z.enum(outputModes).optional().default("content"),
        type: z.union([z.string(), z.array(z.string())]).optional(),
        glob: z.union([z.string(), z.array(z.string())]).optional(),
        ignoreCase: z.boolean().optional().default(false),
        fixedStrings: z.boolean().optional().default(false),
        wordRegexp: z.boolean().optional().default(false),
        context: z.number().int().nonnegative().optional(),
        beforeContext: z.number().int().nonnegative().optional(),
        afterContext: z.number().int().nonnegative().optional(),
        multiline: z.boolean().optional().default(false),
        multilineDotall: z.boolean().optional().default(false),
        maxCount: z.number().int().positive().optional().default(DEFAULT_MAX_COUNT),
        hidden: z.boolean().optional().default(false),
        noIgnore: z.boolean().optional().default(false),
    }),
    run: grep
};
