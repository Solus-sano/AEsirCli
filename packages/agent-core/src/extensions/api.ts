import type { Tool } from "../tools.js";
import type { EventHandler, Extension, ExtensionAPI, ExtensionEvent, RegisteredCommand } from "./types.js";


export function createExtensionAPI(extension: Extension): ExtensionAPI {
    return {
        on(
            event: ExtensionEvent["type"],
            handler: EventHandler
        ): void {
            const handlers = extension.handlers.get(event) ?? [];
            handlers.push(handler);
            extension.handlers.set(event, handlers);
        },
        registerTool(tool: Tool): void {
            extension.tools.set(tool.name, tool);
        },
        registerCommand(command: RegisteredCommand): void {
            extension.commands.set(command.name, command);
        },
    }
}
