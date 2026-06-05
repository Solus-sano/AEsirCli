


export type LLMEvent = 
    | { type: "text-delta"; text: string, finish_reason: null }
    | { type: "reasoning-delta"; text: string, finish_reason: null }
    | { type: "tool-call-start"; index: number; id: string; name: string, finish_reason: null }
    | { type: "tool-call-delta"; index: number; id: string; argDelta: string, finish_reason: null }
    | { type: "done"; finish_reason: "stop" | "length" | "tool_calls" | "content_filter"}
    | { type: "usage"; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cache_tokens: number; } }
