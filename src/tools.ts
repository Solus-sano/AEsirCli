


export type Tool = {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties?: unknown;
        required?: string[];
    }
    run: (args: unknown) => Promise<string>;
}

export let registry: Record<string, Tool> = {};

export function registerTool(tool: Tool) {
    registry[tool.name] = tool;
}