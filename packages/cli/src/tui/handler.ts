import type { ChatMessage, Provider, LLMEvent } from "@aesir/ai";
import { ifTooLong, compressMessages } from "@aesir/ai";
import {
    runTurnStream,
    registry,
    SessionManager,
} from "@aesir/agent-core";

let currentController: AbortController | null = null;

export function abortCurrentTurn(): boolean {
    if (currentController) {
        currentController.abort();
        currentController = null;
        return true;
    }
    return false;
}

export function isAgentRunning(): boolean {
    return currentController !== null;
}

export async function onUserMessage(
    messages: ChatMessage[], 
    sessionManager: SessionManager,
    sessionId: string,
    LLMProvider: Provider,
    renderFn: (event: LLMEvent) => void
): Promise<void> {
    await sessionManager.append(sessionId, {
        type: "user_message",
        content: messages[messages.length - 1]!.content ?? "",
        timestamp: new Date().toISOString()
    });

    if (ifTooLong(messages)) {
        renderFn({ type: "text-delta", text: "\x1b[90m[compressing context...]\x1b[0m\n", finish_reason: null });
        const { messages: compressed } = await compressMessages(
            { messages, tools: [] },
            LLMProvider
        );
        const summaryContent = compressed[0]?.content ?? "";
        await sessionManager.append(sessionId, {
            type: "summary",
            content: summaryContent,
            timestamp: new Date().toISOString()
        });
        messages.length = 0;
        compressed.forEach(m => messages.push(m));
    }

    currentController = new AbortController();
    const { signal } = currentController;
    try {
        await runTurnStream(
            {
                messages: messages,
                tools: Object.values(registry),
                signal: signal
            },
            LLMProvider,
            (event) => sessionManager.append(sessionId, event),
            renderFn,
        );
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            renderFn({ type: "text-delta", text: "\n\x1b[31m[interrupted]\x1b[0m\n", finish_reason: null });
            return;
        }
        throw error;
    } finally {
        currentController = null;
    }
}
