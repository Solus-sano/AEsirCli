import type { LLMEvent } from "./events.js";

const MAX_TOOL_OUTPUT_LENGTH = 2 * 1024;

export function printLLMStreamEvent(event: LLMEvent) {
    if (event.type === "text-delta") {
        process.stdout.write(`\x1b[32m${event.text}\x1b[0m`);
   
    }
    if (event.type === "reasoning-delta") {
        process.stdout.write(`\x1b[90m${event.text}\x1b[0m`);
   
    }
    if (event.type === "usage") {
        console.log(`\x1b[34m${JSON.stringify(event.usage, null, 2)}\x1b[0m`);
   
    }
    if (event.type === "done") {
        process.stdout.write(`\n`);
    }
}

export function truncateToolOutput(output: string): string {
    if (output.length > MAX_TOOL_OUTPUT_LENGTH) {
        return output.substring(0, MAX_TOOL_OUTPUT_LENGTH) + `\n[Output truncated, total length: ${output.length}]`;
    }
    return output;
}
