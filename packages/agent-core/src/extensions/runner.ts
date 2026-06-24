import type { EventHandler, EventHandlerResult, Extension, ExtensionEvent } from "./types.js";





export class ExtensionRunner {

    private handlers: Map<string, EventHandler[]> = new Map();

    constructor(extensions: Extension[]) {
        for (const extension of extensions) {
            for (const [eventType, handlers] of extension.handlers) {
                if (!this.handlers.has(eventType)) {
                    this.handlers.set(eventType, []);
                }
                this.handlers.get(eventType)!.push(...handlers);
            }
        }
    }

    async emit(event: ExtensionEvent): Promise<EventHandlerResult> {
        const handlers = this.handlers.get(event.type);
        if (!handlers) return;
        for (const handler of handlers) {
            const result: EventHandlerResult = await handler(event);
            if (!result) continue;
            if ("block" in result) {
                return result;
            }
            if ("modifiedResult" in result && event.type === "tool_result") {
                event.result = result.modifiedResult;
            }
        }
    }
}
