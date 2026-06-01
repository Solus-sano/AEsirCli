import process from "node:process";
import { registry } from "./tools.js";
import { parseSSE } from "./sse.js";



const CodingAgentHeader = {
    "User-Agent": process.env.MODEL_USER_AGENT as string,
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "X-Title": "Kimi CLI",
    "HTTP-Referer": "https://kimi.com/code",
    "Content-Type": "application/json",
}

const MAX_TOOL_OUTPUT_LENGTH = 30000;

type SystemMessage = {
    role: "system";
    content: string;
}

type UserMessage = {
    role: "user";
    content: string;
}

type ToolMessage = {
    role: "tool";
    content: string;
    tool_call_id: string;
}

type AssistantMessage = {
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
    reasoning_content?: string;
}

type LLMStreamEvent = 
    | { type: "text-delta"; text: string }
    | { type: "reasoning-delta"; text: string }
    | { type: "tool-call-start"; index: number; id: string; name: string }
    | { type: "tool-call-delta"; index: number; id: string; argDelta: string }
    | { type: "done"; finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null}
    | { type: "usage"; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cache_tokens: number; } }

export type ChatMessage = UserMessage | AssistantMessage | ToolMessage | SystemMessage;

export type ToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
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

export function printLLMStreamEvent(event: LLMStreamEvent) {
    if (event.type === "text-delta") {
        process.stdout.write(`\x1b[32m${event.text}\x1b[0m`);
   
    }
    if (event.type === "reasoning-delta") {
        process.stdout.write(`\x1b[90m${event.text}\x1b[0m`);
   
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

export async function* queryLLMStream(postJson: unknown): AsyncGenerator<LLMStreamEvent> {
    const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: CodingAgentHeader,
        body: JSON.stringify(postJson),
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
            yield { type: "text-delta", text: delta.content };
        }

        if (delta.reasoning_content) {
            yield { type: "reasoning-delta", text: delta.reasoning_content };
        }

        if (delta.tool_calls) {
            for (const toolCall of delta.tool_calls) {
                if (toolCall.id && toolCall.function?.name) {
                    yield { type: "tool-call-start", index: toolCall.index, id: toolCall.id, name: toolCall.function.name };
                }
                if (toolCall.function?.arguments) {
                    yield { type: "tool-call-delta", index: toolCall.index, id: toolCall.id ?? "", argDelta: toolCall.function.arguments };
                }
            }
        }

        if (finish_reason) {
            yield { type: "done", finishReason: finish_reason };
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

export async function* chatStream(messages: ChatMessage[]): AsyncGenerator<LLMStreamEvent> {
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
    
    for await (const event of queryLLMStream(postJson)) {
        yield event;
    }
}

export async function runTurn(messages: ChatMessage[]): Promise<AssistantMessage> {
    while (true) {
        const assistantMessage = await chatSingle(messages);
        messages.push(assistantMessage);
        console.log(JSON.stringify(assistantMessage, null, 2));

        if (assistantMessage.tool_calls) {
            for (const toolCall of assistantMessage.tool_calls) {
                const tool = registry[toolCall.function.name];
                if (!tool) {
                    messages.push({ role: "tool", content: `Error: tool "${toolCall.function.name}" not found`, tool_call_id: toolCall.id });
                    continue;
                }

                let tool_result: string;
                try {
                    tool_result = await tool.run(JSON.parse(toolCall.function.arguments));
                } catch (error) {
                    tool_result = `Error running tool ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`;
                }
                messages.push({role: "tool", content: tool_result, tool_call_id: toolCall.id});
            }
        }
        else {
            return assistantMessage;
        }
    }
}

export async function runTurnStream(messages: ChatMessage[]): Promise<AssistantMessage> {
    while (true) {
        let completeContent = "";
        let completeReasoningContent = "";
        let finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null = null;
        const toolCalls: Map<string, {id: string, name: string, arguments: string}> = new Map();
        for await (const event of chatStream(messages)) {
            // yield event;
            if (event.type === "text-delta") {
                completeContent += event.text;
            }
            if (event.type === "reasoning-delta") {
                completeReasoningContent += event.text;
            }
            if (event.type === "tool-call-start") {
                toolCalls.set(event.index.toString(), {id: event.id, name: event.name, arguments: ""});
            }
            if (event.type === "tool-call-delta") {
                const toolCall = toolCalls.get(event.index.toString());
                if (toolCall) {
                    toolCall.arguments += event.argDelta;
                }
            }
            if (event.type === "done") {
                finishReason = event.finishReason;
            }
            printLLMStreamEvent(event);
        }
        const tool_calls = Array.from(toolCalls.values()).map(toolCall => ({
            id: toolCall.id,
            type: "function",
            function: {
                name: toolCall.name,
                arguments: toolCall.arguments,
            },
        })) as ToolCall[];
        let assistantMessage: AssistantMessage 
        if (tool_calls.length > 0) {
            assistantMessage = {
                role: "assistant",
                content: completeContent,
                reasoning_content: completeReasoningContent,
                tool_calls: tool_calls,
            };
            for (const toolCall of tool_calls) {
                process.stdout.write(`\x1b[90mUse tool: ${toolCall.function.name} with arguments: ${toolCall.function.arguments}\n\x1b[0m`);
            }
        }
        else {
            assistantMessage = {
                role: "assistant",
                content: completeContent,
                reasoning_content: completeReasoningContent,
            };
        }
        messages.push(assistantMessage);
        // console.log(JSON.stringify(assistantMessage, null, 2));
        
        if (assistantMessage.tool_calls) {
            for (const toolCall of assistantMessage.tool_calls) {
                const tool = registry[toolCall.function.name];
                if (!tool) {
                    messages.push({ role: "tool", content: `Error: tool "${toolCall.function.name}" not found`, tool_call_id: toolCall.id });
                    continue;
                }

                let tool_result: string;
                try {
                    tool_result = await tool.run(JSON.parse(toolCall.function.arguments));
                    tool_result = truncateToolOutput(tool_result);
                } catch (error) {
                    tool_result = `Error running tool ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`;
                }
                messages.push({role: "tool", content: tool_result, tool_call_id: toolCall.id});
            }
        }
        else return assistantMessage;
    }
}