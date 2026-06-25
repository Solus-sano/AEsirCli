import { bashTool, readFilesTool } from "@aesir/agent-core";
import { createAgent } from "@aesir/sdk";

const agent = createAgent({
    model: "kimi-k2.7",
    tools: [readFilesTool, bashTool],
    systemPrompt: "你是一个编程助手。",
});

const result = await agent.chat("帮我看看 src/index.ts");
console.log(result.text);