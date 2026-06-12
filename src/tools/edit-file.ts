import type { Tool } from "../tools.js"
import { z } from "zod";
import fs from "fs/promises";
import { resolveSafePath } from "./path-safety.js";


async function editFile(args: unknown): Promise<string> {
    const { path, old_string, new_string, replace_all } = args as {
        path: string;
        old_string: string;
        new_string: string;
        replace_all: boolean;
    };
    const safePath = await resolveSafePath(path, process.cwd());
    const content = await fs.readFile(path, "utf-8");

    const count = content.split(old_string).length - 1;
    if (count === 0) {
        return `No occurrences of old_string found in file`;
    } else if (count > 1 && !replace_all) {
        return `found ${count} occurrences, set replace_all or provide more context`;
    }
    let newContent: string;

    if (replace_all) {
        newContent = content.split(old_string).join(new_string);
    } else {
        newContent = content.replace(old_string, new_string);
    }
    await fs.writeFile(path, newContent);
    return `replaced ${count} occurrences of old_string with new_string in ${path}`;
}



export const editFileTool: Tool = {
    name: "edit_file",
    description: "Edit a file",
    parameters: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "The path to the file to edit"
            },
            old_string: {
                type: "string",
                description: "The string to replace"
            },
            new_string: {
                type: "string",
                description: "The string to replace with"
            },
            replace_all: {
                type: "boolean",
                description: "Whether to replace all occurrences of the old string",
                default: false
            }
        }
    },
    schema: z.object({
        path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional().default(false)
    }),
    needsConfirmation: true,
    run: editFile
}