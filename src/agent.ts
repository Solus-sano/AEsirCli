import process from "node:process";
import { registry } from "./tools.js";
import type { SessionEvent } from "./session.js";
import { z } from "zod";

import type { ChatMessage, AssistantMessage, ToolCall } from "./messages.js";
import { printLLMStreamEvent, truncateToolOutput } from "./render.js";
import type { ProviderInput, Provider } from "./providers/types.js";

export async function runTurnStream(
    input: ProviderInput, 
    LLMProvider: Provider,
    onEvent?: (event: SessionEvent) => Promise<void>,
    renderContent: boolean = false,
    confirmToolCall?: (toolName: string, args: unknown) => Promise<boolean>
): Promise<ProviderInput> {
    while (true) {
        let completeContent = "";
        let completeReasoningContent = "";
        let finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null = null;
        const toolCalls: Map<string, {id: string, name: string, arguments: string}> = new Map();
        for await (const event of LLMProvider.stream(input, LLMProvider)) {
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
            if (renderContent) {
                printLLMStreamEvent(event);
            }
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
        input.messages.push(assistantMessage);
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
                    input.messages.push({ role: "tool", content: `Error: tool "${toolCall.function.name}" not found`, tool_call_id: toolCall.id });
                    continue;
                }

                let tool_result: string;
                try {
                    const parsedArgs = tool.schema.parse(JSON.parse(toolCall.function.arguments));
                    if (tool.needsConfirmation && confirmToolCall) {
                        const confirmed = await confirmToolCall(tool.name, parsedArgs);
                        if (!confirmed) {
                            tool_result = "Tool call denied by user";
                        } else {
                            tool_result = await tool.run(parsedArgs);
                            tool_result = truncateToolOutput(tool_result);
                        }
                    } else {
                        tool_result = await tool.run(parsedArgs);
                        tool_result = truncateToolOutput(tool_result);
                    }
                } catch (error) {
                    if (error instanceof z.ZodError) {
                        tool_result = `Invalid arguments for tool ${toolCall.function.name}: ${error.message}`;
                    } else {
                    tool_result = `Error running tool ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`;
                    }
                }
                input.messages.push({role: "tool", content: tool_result, tool_call_id: toolCall.id});
                await onEvent?.({
                    type: "tool_result",
                    tool_call_id: toolCall.id,
                    content: tool_result,
                    timestamp: new Date().toISOString()
                } as SessionEvent);
            }
        }
        else return input;
    }
}
