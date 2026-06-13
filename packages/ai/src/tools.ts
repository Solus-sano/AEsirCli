export type ToolSpec = {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties?: unknown;
        required?: string[];
    }
}
