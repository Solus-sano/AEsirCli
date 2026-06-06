import type { Tool } from "../tools.js";
import type { ChatMessage } from "../messages.js";
import type { LLMEvent } from "../events.js";



export type ProviderInput = {
    messages: ChatMessage[];
    tools: Tool[];
    signal?: AbortSignal;
};

export type Provider = {
    model: string;
    baseUrl: string;
    apiKey: string;
    stream(input: ProviderInput, provider: Provider): AsyncGenerator<LLMEvent>;
};