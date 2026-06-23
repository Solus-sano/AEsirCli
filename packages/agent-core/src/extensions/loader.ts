import path from "path";
import fs from "fs";
import { createJiti } from "jiti";
import type { Extension, ExtensionFactory } from "./types.js";
import { createExtensionAPI } from "./api.js";





export function isExtensionFile(filePath: string): boolean {
    return filePath.endsWith(".ts") || filePath.endsWith(".js");
}

export function discoverExtensions(dir: string): string[] {
    const extensions: string[] = [];

    // catch ENOENT error
    try {
        for (const file of fs.readdirSync(dir)) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                extensions.push(...discoverExtensions(filePath));
            } else if (isExtensionFile(filePath)) {
                extensions.push(filePath);
            }
        }
    } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") {
            return [];
        }
        throw error;
    }

    return extensions;
}

export async function loadExtensionModule(filePath: string): Promise<ExtensionFactory> {
    const jiti = createJiti(import.meta.url);

    const mod = await jiti.import(filePath) as Record<string, unknown>;
    const factory = mod.default;
    if (typeof factory !== "function") {
        throw new Error(`Extension ${filePath} does not have a default export that is a function`);
    }
    return factory as ExtensionFactory;
}

export async function loadExtension(paths: string[]): Promise<{ extensions: Extension[], errors: string[] }> {
    const extensions: Extension[] = [];
    const errors: string[] = [];
    for (const path of paths) {
        try {
            const factory = await loadExtensionModule(path);
            const extension: Extension = {
                path,
                handlers: new Map(),
                tools: new Map(),
                commands: new Map(),
            }
            const api = createExtensionAPI(extension);
            await factory(api);
            extensions.push(extension);
        } catch (error) {
            errors.push(`Failed to load extension ${path}: ${error}`);
        }
    }
    return { extensions, errors };
}