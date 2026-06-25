import type { Tool } from "../tools.js"


export type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>
export type EventHandler = (event: ExtensionEvent) => EventHandlerResult | Promise<EventHandlerResult> 

export interface ExtensionAPI {
    on(event: ExtensionEvent["type"], handler: EventHandler): void
    registerTool(tool: Tool): void
    registerCommand(command: RegisteredCommand): void
}


export type ExtensionEvent =
  | { type: "session_start" }
  | { type: "tool_call"; toolName: string; args: unknown }
  | { type: "tool_result"; toolName: string; result: string }
  | { type: "session_shutdown" }

export interface Extension {
    path: string
    handlers: Map<string, EventHandler[]> // event type -> handlers
    tools: Map<string, Tool>
    commands: Map<string, RegisteredCommand>
}

export type EventHandlerResult =
  | void                                          // 大多数情况：不干预
  | { block: true; reason: string }               // tool_call 专用：拦截
  | { modifiedResult: string }                    // tool_result 专用：改结果

export interface RegisteredCommand {
    name: string
    description?: string
    handler: (args: string) => Promise<string | void>
} 