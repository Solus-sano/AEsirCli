import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function readContextFile(filePath: string): Promise<string | null> {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        return `Source: ${filePath}\n${content.trimEnd()}`;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

export async function loadProjectContext(cwd: string): Promise<string> {
    const contextPaths = [
        path.join(os.homedir(), ".aesir-cli", "CLAUDE.md"),
        path.join(path.resolve(cwd), "CLAUDE.md"),
    ];

    const sections: string[] = [];
    for (const contextPath of contextPaths) {
        const section = await readContextFile(contextPath);
        if (section) {
            sections.push(section);
        }
    }

    return sections.join("\n\n---\n\n");
}
