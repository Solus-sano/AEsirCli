import fg from "fast-glob";
import type { Tool } from "../tools.js";
import { z } from "zod";
import { resolveSafePath } from "./path-safety.js";



async function glob(args: unknown): Promise<string> {
    const {
        pattern,
        cwd,
        dot,
        onlyFiles
    } = args as {
        pattern: string;
        cwd: string;
        dot?: boolean;
        onlyFiles?: boolean;
    };
    const safeCwd = await resolveSafePath(cwd, process.cwd());
    const files = await fg(pattern, {
        cwd,
        dot: dot ?? true,
        onlyFiles: onlyFiles ?? true,
    });
    if (files.length === 0) {
        return "No files found";
    }
    if (File.length > 100) {
        return `Found ${files.length} files, (showing first 100):\n ${files.slice(0, 100).join("\n")}`;
    }

    return `Found ${files.length} files: \n ${files.join("\n")}`;
}


export const globTool: Tool = {
    name: "glob",
    description: "Find files matching a pattern",
    parameters: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "The pattern to match files (e.g. '**/*.ts')"
            },
            cwd: {
                type: "string",
                description: "The working directory to search in, default is the current working directory"
            },
            dot: {
                type: "boolean",
                description: "Whether to include dot files (hidden files), default is true"
            },
            onlyFiles: {
                type: "boolean",
                description: "Whether to only include files without directories, default is true"
            }
        }
    },
    schema: z.object({
        pattern: z.string(),
        cwd: z.string().optional().default(process.cwd()),
        dot: z.boolean().optional().default(true),
        onlyFiles: z.boolean().optional().default(true)
    }),
    needsConfirmation: false,
    run: glob
}