import type { Tool } from "../tools.js";
import { z } from "zod";
import fs from "fs/promises";

import { resolveSafePath } from "./path-safety.js";

async function readFile(args: unknown): Promise<string> {
    const path = (args as { path: string }).path;
    const safePath = await resolveSafePath(path, process.cwd());
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
    needsConfirmation: false,
    run: readFile
}
