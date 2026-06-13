import type { ChatMessage, AssistantMessage } from "../messages.js";
import { parseSSE } from "../sse.js";
import type { LLMEvent } from "../events.js";
import type { Provider, ProviderInput } from "./types.js";


function CodingAgentHeader(baseUrl: string, apiKey: string): Record<string, string> {
    return {
    "User-Agent": (process.env.MODEL_USER_AGENT as string) ?? "claude-cli/2.1.108",
    "Authorization": `Bearer ${apiKey}`,
    "X-Title": "Kimi CLI",
    "HTTP-Referer": "https://kimi.com/code",
    "Content-Type": "application/json",
    }
}

type ChatCompletionResponse = {
    choices: {
        message: ChatMessage;
        finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cache_tokens: number;
    };
}

type StreamChunk = {
    id: string;
    model: string;
    created: number;
    object: "chat.completion.chunk";
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cache_tokens: number;
    };
    choices: {
        delta: {
        role?: string;
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
        }[];
        };
        finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
    }[];
}


export async function* queryLLMStream(
    postJson: unknown, 
    baseUrl: string,
    apiKey: string,
    signal?: AbortSignal,
): AsyncGenerator<LLMEvent> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: CodingAgentHeader(baseUrl, apiKey) as Record<string, string>,
        body: JSON.stringify(postJson),
        signal: signal ?? null,
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} - ${await response.text()}`);
    }
    // else console.log("Response OK");
    
    for await (const event of parseSSE(response.body as ReadableStream<Uint8Array>)) {
        const chunk = JSON.parse(event.data) as StreamChunk;
        if (chunk.usage) {
            yield { type: "usage", usage: chunk.usage };
            continue;
        }

        const firstChoice = chunk.choices[0];
        if (!firstChoice) {
            throw new Error("No message in response");
        }

        const { delta, finish_reason } = firstChoice;
        if (delta.content) {
            yield { type: "text-delta", text: delta.content, finish_reason: null };
        }

        if (delta.reasoning_content) {
            yield { type: "reasoning-delta", text: delta.reasoning_content, finish_reason: null };
        }

        if (delta.tool_calls) {
            for (const toolCall of delta.tool_calls) {
                if (toolCall.id && toolCall.function?.name) {
                    yield { type: "tool-call-start", index: toolCall.index, id: toolCall.id, name: toolCall.function.name, finish_reason: null };
                }
                if (toolCall.function?.arguments) {
                    yield { type: "tool-call-delta", index: toolCall.index, id: toolCall.id ?? "", argDelta: toolCall.function.arguments, finish_reason: null };
                }
            }
        }

        if (finish_reason) {
            yield { type: "done", finish_reason: finish_reason };
        }
    }
    
}

export async function* chatStreamForProvider(input: ProviderInput, provider: Provider): AsyncGenerator<LLMEvent> {
    const tools = input.tools.map(tool => ({
        "type": "function",
        "function": tool
    }));
    const postJson = {
        "model": provider.model,
        "messages": input.messages,
        "stream": true,
        // "temperature": process.env.TEMPRETURE,
        "tools": tools
    }
    
    for await (const event of queryLLMStream(postJson, provider.baseUrl, provider.apiKey, input.signal)) {
        yield event;
    }
}

export function getKimiCLICompatProvider(model: string, baseUrl: string, apiKey: string): Provider {
    return {
        model: model,
        baseUrl: baseUrl,
        apiKey: apiKey,
        stream: chatStreamForProvider,
    }
}