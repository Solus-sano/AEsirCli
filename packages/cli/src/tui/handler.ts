import type { ChatMessage, Provider, LLMEvent } from "@aesir/ai";
import {
    runTurnStream,
    registry,
    SessionManager,
} from "@aesir/agent-core";
import { resetRenderState } from "../render.js";



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
    let currentController: AbortController | null = new AbortController();
    const { signal } = currentController;
    try {
        const providerOutput = await runTurnStream(
            {
                messages: messages,
                tools: Object.values(registry),
                signal: signal
            },
            LLMProvider,
            (event) => sessionManager.append(sessionId, event),
            renderFn,
            // confirmToolCall,
        );
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            resetRenderState();
            process.stdout.write('\n\x1b[31m[interrupted by user]\x1b[0m\n');
            return;
        } else {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
    } finally {
        currentController = null;
    }
}