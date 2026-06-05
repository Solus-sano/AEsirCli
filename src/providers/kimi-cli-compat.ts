import { type ChatMessage, type AssistantMessage } from "../messages.js";
import { registry } from "../tools.js";
import { parseSSE } from "../sse.js";
import { type LLMEvent } from "../events.js";


const CodingAgentHeader = {
    "User-Agent": process.env.MODEL_USER_AGENT as string,
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "X-Title": "Kimi CLI",
    "HTTP-Referer": "https://kimi.com/code",
    "Content-Type": "application/json",
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

export async function queryLLM(postJson: unknown): Promise<AssistantMessage> {
    const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: CodingAgentHeader,
        body: JSON.stringify(postJson),
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${await response.text()}`);
    }
    const CompleteData = await response.json() as ChatCompletionResponse;


    const FirstChoices = CompleteData.choices[0];
    if (!FirstChoices) {
        throw new Error("No message in response");
    }
    return FirstChoices.message as AssistantMessage;
}

export async function* queryLLMStream(postJson: unknown, signal?: AbortSignal): AsyncGenerator<LLMEvent> {
    const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: CodingAgentHeader,
        body: JSON.stringify(postJson),
        signal: signal ?? null,
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${await response.text()}`);
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

export async function chatSingle(messages: ChatMessage[]): Promise<AssistantMessage> {
    
    const tools = Object.values(registry).map(tool => ({
        "type": "function",
        "function": tool
    }));

    const postJson = {
        "model": process.env.MODEL,
        "messages": messages,
        "stream": false,
        // "temperature": process.env.TEMPRETURE,
        "tools": tools
    }
    // console.log(JSON.stringify(postJson, null, 2));
    return await queryLLM(postJson);
}

export async function* chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<LLMEvent> {
    const tools = Object.values(registry).map(tool => ({
        "type": "function",
        "function": tool
    }));
    const postJson = {
        "model": process.env.MODEL,
        "messages": messages,
        "stream": true,
        // "temperature": process.env.TEMPRETURE,
        "tools": tools
    }
    
    for await (const event of queryLLMStream(postJson, signal)) {
        yield event;
    }
}   