import type { ChatMessage } from "../messages.js";
import { parseSSE } from "../sse.js";
import type { LLMEvent } from "../events.js";
import type { Provider, ProviderInput } from "./types.js";
import type { ToolSpec } from "../tools.js";

const ANTHROPIC_VERSION = "2023-06-01";

function anthropicHeaders(baseUrl: string, apiKey: string): Record<string, string> {
    return {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "User-Agent": (process.env.MODEL_USER_AGENT as string) ?? "claude-cli/2.1.108",
        "X-Title": "claude-cli/2.1.108",
        "HTTP-Referer": "https://claude.com/code",
    };
}

// ---- Anthropic wire types ----

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type AnthropicToolResultBlock = {
    type: "tool_result";
    tool_use_id: string;
    content: string;
};
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

type AnthropicMessage = {
    role: "user" | "assistant";
    content: AnthropicContentBlock[];
};

type AnthropicTool = {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties?: unknown;
        required?: string[];
    };
};

// SSE event payloads we care about.
type AnthropicStreamEvent =
    | { type: "message_start"; message: { usage?: { input_tokens: number; cache_read_input_tokens?: number } } }
    | {
          type: "content_block_start";
          index: number;
          content_block:
              | { type: "text"; text: string }
              | { type: "tool_use"; id: string; name: string; input: unknown }
              | { type: "thinking"; thinking: string };
      }
    | {
          type: "content_block_delta";
          index: number;
          delta:
              | { type: "text_delta"; text: string }
              | { type: "input_json_delta"; partial_json: string }
              | { type: "thinking_delta"; thinking: string };
      }
    | { type: "content_block_stop"; index: number }
    | {
          type: "message_delta";
          delta: { stop_reason: string | null };
          usage?: { output_tokens: number };
      }
    | { type: "message_stop" }
    | { type: "ping" }
    | { type: "error"; error: { type: string; message: string } };

// ---- Conversion: internal ChatMessage[] -> Anthropic system + messages ----

function toAnthropicRequest(messages: ChatMessage[], tools: ToolSpec[]): {
    system: string | undefined;
    messages: AnthropicMessage[];
    tools: AnthropicTool[];
} {
    const systemParts: string[] = [];
    const out: AnthropicMessage[] = [];

    const pushBlock = (role: "user" | "assistant", block: AnthropicContentBlock) => {
        const last = out[out.length - 1];
        if (last && last.role === role) {
            last.content.push(block);
        } else {
            out.push({ role, content: [block] });
        }
    };

    for (const msg of messages) {
        if (msg.role === "system") {
            systemParts.push(msg.content);
            continue;
        }

        if (msg.role === "user") {
            pushBlock("user", { type: "text", text: msg.content });
            continue;
        }

        if (msg.role === "tool") {
            // Anthropic carries tool results as user-role tool_result blocks.
            pushBlock("user", {
                type: "tool_result",
                tool_use_id: msg.tool_call_id,
                content: msg.content,
            });
            continue;
        }

        // assistant
        if (msg.content) {
            pushBlock("assistant", { type: "text", text: msg.content });
        }
        if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
                let input: unknown = {};
                try {
                    input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
                } catch {
                    input = {};
                }
                pushBlock("assistant", {
                    type: "tool_use",
                    id: tc.id,
                    name: tc.function.name,
                    input,
                });
            }
        }
    }

    const anthropicTools: AnthropicTool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
    }));

    return {
        system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        messages: out,
        tools: anthropicTools,
    };
}

function mapStopReason(
    stopReason: string | null
): "stop" | "length" | "tool_calls" | "content_filter" {
    switch (stopReason) {
        case "tool_use":
            return "tool_calls";
        case "max_tokens":
            return "length";
        case "refusal":
            return "content_filter";
        case "end_turn":
        case "stop_sequence":
        default:
            return "stop";
    }
}

export async function* queryLLMStream(
    postJson: unknown,
    baseUrl: string,
    apiKey: string,
    signal?: AbortSignal
): AsyncGenerator<LLMEvent> {
    const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: anthropicHeaders(baseUrl, apiKey) as Record<string, string>,
        body: JSON.stringify(postJson),
        signal: signal ?? null,
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${await response.text()}`);
    }

    // Map Anthropic content-block index -> tool_call id (so deltas know their id).
    const toolCallByIndex: Map<number, { id: string }> = new Map();
    let promptTokens = 0;
    let cacheTokens = 0;
    let completionTokens = 0;
    let stopReason: string | null = null;

    for await (const event of parseSSE(response.body as ReadableStream<Uint8Array>)) {
        const chunk = JSON.parse(event.data) as AnthropicStreamEvent;

        switch (chunk.type) {
            case "message_start": {
                promptTokens = chunk.message.usage?.input_tokens ?? 0;
                cacheTokens = chunk.message.usage?.cache_read_input_tokens ?? 0;
                break;
            }
            case "content_block_start": {
                const block = chunk.content_block;
                if (block.type === "tool_use") {
                    toolCallByIndex.set(chunk.index, { id: block.id });
                    yield {
                        type: "tool-call-start",
                        index: chunk.index,
                        id: block.id,
                        name: block.name,
                        finish_reason: null,
                    };
                } else if (block.type === "text" && block.text) {
                    yield { type: "text-delta", text: block.text, finish_reason: null };
                } else if (block.type === "thinking" && block.thinking) {
                    yield { type: "reasoning-delta", text: block.thinking, finish_reason: null };
                }
                break;
            }
            case "content_block_delta": {
                const delta = chunk.delta;
                if (delta.type === "text_delta") {
                    yield { type: "text-delta", text: delta.text, finish_reason: null };
                } else if (delta.type === "thinking_delta") {
                    yield { type: "reasoning-delta", text: delta.thinking, finish_reason: null };
                } else if (delta.type === "input_json_delta") {
                    const tc = toolCallByIndex.get(chunk.index);
                    yield {
                        type: "tool-call-delta",
                        index: chunk.index,
                        id: tc?.id ?? "",
                        argDelta: delta.partial_json,
                        finish_reason: null,
                    };
                }
                break;
            }
            case "message_delta": {
                if (chunk.delta.stop_reason) {
                    stopReason = chunk.delta.stop_reason;
                }
                if (chunk.usage?.output_tokens) {
                    completionTokens = chunk.usage.output_tokens;
                }
                break;
            }
            case "message_stop": {
                yield {
                    type: "usage",
                    usage: {
                        prompt_tokens: promptTokens,
                        completion_tokens: completionTokens,
                        total_tokens: promptTokens + completionTokens,
                        cached_tokens: cacheTokens,
                    },
                };
                yield { type: "done", finish_reason: mapStopReason(stopReason) };
                break;
            }
            case "error": {
                throw new Error(`Anthropic stream error: ${chunk.error.type}: ${chunk.error.message}`);
            }
            default:
                break;
        }
    }
}

function buildRequest(input: ProviderInput, provider: Provider, stream: boolean) {
    const { system, messages, tools } = toAnthropicRequest(input.messages, input.tools);
    const maxTokens = Number(process.env.MAX_TOKENS ?? 256 * 1024);
    return {
        model: provider.model,
        max_tokens: maxTokens,
        stream,
        ...(system ? { system } : {}),
        messages,
        ...(tools.length > 0 ? { tools } : {}),
    };
}

export async function* chatStreamForProvider(input: ProviderInput, provider: Provider): AsyncGenerator<LLMEvent> {
    const postJson = buildRequest(input, provider, true);
    for await (const event of queryLLMStream(postJson, provider.baseUrl, provider.apiKey, input.signal)) {
        yield event;
    }
}

export function getAnthropicProvider(model: string, baseUrl: string, apiKey: string): Provider {
    return {
        model: model,
        baseUrl: baseUrl,
        apiKey: apiKey,
        stream: chatStreamForProvider,
    }
}
