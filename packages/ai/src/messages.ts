

export type SystemMessage = {
    role: "system";
    content: string;
}

export type UserMessage = {
    role: "user";
    content: string;
}

export type ToolMessage = {
    role: "tool";
    content: string;
    tool_call_id: string;
}

export type AssistantMessage = {
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
    reasoning_content?: string;
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export type ToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export type ChatMessage = UserMessage | AssistantMessage | ToolMessage | SystemMessage;
