import fs from "fs/promises"
import type { Tool } from "../tools.js";
import { z } from "zod";
import { dirname } from "path";
import { resolveSafePath } from "./path-safety.js";



async function writeFile(args: unknown): Promise<string> {
    const { path, content } = args as {
        path: string;
        content: string;
    };
    const safePath = await resolveSafePath(path, process.cwd());
    await fs.mkdir(dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content);
    const contentBytes = Buffer.byteLength(content, "utf-8");
    return `Wrote ${contentBytes} bytes to ${path}`;
}


export const writeFileTool: Tool = {
    name: "write_file",
    description: "Write a file",
    parameters: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "The path to the file to write"
            },
            content: {
                type: "string",
                description: "The content to write to the file"
            }   
        },
        required: ["path", "content"]
    },
    schema: z.object({
        path: z.string(),
        content: z.string()
    }),
    run: writeFile
}
