import { registerTool, type Tool } from "@aesir/agent-core";
import { getProvider, resolveModel, type Provider, type ChatMessage, type ProviderInput } from "@aesir/ai";
import { runTurnStream } from "@aesir/agent-core";

export type CreateAgentOptions = {
    model: string;
    tools: Tool[];
    systemPrompt: string;
}

export class Agent {
    private tools: Tool[];
    private systemPrompt: string;
    private model: string;
    private LLMProvider: Provider;

    private messages: ChatMessage[] = [];

    constructor(options: CreateAgentOptions) {
        this.tools = options.tools;
        this.tools.forEach(tool => registerTool(tool));
        this.systemPrompt = options.systemPrompt;
        this.model = options.model;

        const modelConfig = resolveModel(this.model);
        this.LLMProvider = getProvider(modelConfig);

        this.messages.push({role: "system", content: this.systemPrompt});
    }

    async chat(prompt: string): Promise<{ text: string, messages: ChatMessage[] }> {
        this.messages.push({role: "user", content: prompt});
        const providerOutput: ProviderInput = await runTurnStream(
            {
                messages: this.messages,
                tools: this.tools,
                signal: undefined
            },
            this.LLMProvider,
            undefined,
            undefined,
            undefined,
        );

        const lastMessage = providerOutput.messages[providerOutput.messages.length - 1];
        const resultStr = lastMessage?.content ?? "";
        return { text: resultStr, messages: providerOutput.messages };
    }
}

export function createAgent(
    options: CreateAgentOptions,
): Agent {
    return new Agent(options);
}
