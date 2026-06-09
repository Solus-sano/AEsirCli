import type { Tool } from "../tools.js";
import { z } from "zod";
import fs from "fs/promises";


async function readFile(args: unknown): Promise<string> {
    const path = (args as { path: string }).path;
    return await fs.readFile(path, "utf-8");
}

export const readFilesTool: Tool = {
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
    schema: z.object({
        path: z.string()
    }),
    run: readFile
}
