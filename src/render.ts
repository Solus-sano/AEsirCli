import type { LLMEvent } from "./events.js";

const MAX_TOOL_OUTPUT_LENGTH = 2 * 1024;

let inThinking = false;

export function resetRenderState() {
    if (inThinking) {
        process.stdout.write(`\x1b[0m`);
        inThinking = false;
    }
}

export function printLLMStreamEvent(event: LLMEvent) {
    if (event.type === "reasoning-delta") {
        if (!inThinking) {
            inThinking = true;
            process.stdout.write(`\x1b[2m\x1b[36m❯ thinking...\n`);
        }
        process.stdout.write(event.text);
    } else if (event.type === "text-delta") {
        if (inThinking) {
            inThinking = false;
            process.stdout.write(`\x1b[0m\n`);
        }
        process.stdout.write(`\x1b[32m${event.text}\x1b[0m`);
    } else if (event.type === "usage") {
        if (inThinking) {
            inThinking = false;
            process.stdout.write(`\x1b[0m\n`);
        }
        const cachedTokens = event.usage.cached_tokens ?? event.usage.prompt_cache_hit_tokens ?? event.usage.prompt_tokens_details?.cached_tokens ;
        process.stdout.write(`\x1b[2m\x1b[34m[tokens: ${event.usage.prompt_tokens} in / ${event.usage.completion_tokens} out / ${cachedTokens} cached]\x1b[0m\n`);
    } else if (event.type === "done") {
        if (inThinking) {
            inThinking = false;
            process.stdout.write(`\x1b[0m`);
        }
        process.stdout.write(`\n`);
    }
}

export function truncateToolOutput(output: string): string {
    if (output.length > MAX_TOOL_OUTPUT_LENGTH) {
        return output.substring(0, MAX_TOOL_OUTPUT_LENGTH) + `\n[Output truncated, total length: ${output.length}]`;
    }
    return output;
}
