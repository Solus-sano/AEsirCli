import process from "node:process";
import { registry } from "./tools.js";



const CodingAgentHeader = {
    "User-Agent": process.env.MODEL_USER_AGENT as string,
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "X-Title": "Kimi CLI",
    "HTTP-Referer": "https://kimi.com/code",
    "Content-Type": "application/json",
}


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

export type ChatMessage = UserMessage | AssistantMessage | ToolMessage | SystemMessage;

export type ToolCall = {
    "id": string;
    "type": "function";
    "function": {
        "name": string;
        "arguments": string;
    };
}


type ChatCompletionResponse = {
    "choices": {
        "message": ChatMessage;
        "finish_reason": "stop" | "length" | "toolUse" | "error" | "aborted";
    }[];
    "usage": {
        "prompt_tokens": number;
        "completion_tokens": number;
        "total_tokens": number;
    };
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