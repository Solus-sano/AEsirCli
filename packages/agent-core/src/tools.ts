import type { z } from "zod";
import type { ToolSpec } from "@aesir/ai";

export type Tool = ToolSpec & {
    schema: z.ZodType<any>;
    needsConfirmation: boolean;
    run: (args: unknown) => Promise<string>;
}

export let registry: Record<string, Tool> = {};

export function registerTool(tool: Tool) {
    registry[tool.name] = tool;
}
