import process from "node:process";
import { registry } from "./tools.js";
import type { SessionEvent } from "./session.js";

import type { ChatMessage, AssistantMessage, ToolCall } from "./messages.js";
import { printLLMStreamEvent, truncateToolOutput } from "./render.js";
import { chatSingle, chatStream } from "./providers/kimi-cli-compat.js";

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

export async function runTurnStream(
    messages: ChatMessage[], 
    signal?: AbortSignal,
    onEvent?: (event: SessionEvent) => Promise<void>
): Promise<AssistantMessage> {
    while (true) {
        let completeContent = "";
        let completeReasoningContent = "";
        let finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null = null;
        const toolCalls: Map<string, {id: string, name: string, arguments: string}> = new Map();
        for await (const event of chatStream(messages, signal)) {
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
                finishReason = event.finish_reason;
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
                finish_reason: finishReason,
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
                finish_reason: finishReason,
            };
        }
        messages.push(assistantMessage);
        await onEvent?.({
            type: "assistant_message",
            content: assistantMessage.content,
            tool_calls: assistantMessage.tool_calls ?? [],
            reasoning_content: assistantMessage.reasoning_content ?? "",
            finish_reason: assistantMessage.finish_reason ?? null,
            timestamp: new Date().toISOString()
        } as SessionEvent);
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
                await onEvent?.({
                    type: "tool_result",
                    tool_call_id: toolCall.id,
                    content: tool_result,
                    timestamp: new Date().toISOString()
                } as SessionEvent);
            }
        }
        else return assistantMessage;
    }
}