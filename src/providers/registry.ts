import { getAnthropicProvider } from "./anthropic.js";
import { getKimiCLICompatProvider } from "./kimi-cli-compat.js";
import type { Provider } from "./types.js";

type ModelConfig = {
    provider: "kimi-cli-compat" | "anthropic";
    baseUrl: string;
    apiKey: string;
    model: string;
}

type ModelPrefixRule = {
    provider: ModelConfig["provider"];
    baseUrlEnv: string;
    apiKeyEnv: string;
    defaultBaseUrl: string;
}

const MODEL_PREFIX_RULES: Record<string, ModelPrefixRule> = {
    kimi: {
        provider: "kimi-cli-compat",
        baseUrlEnv: "KIMI_BASE_URL",
        apiKeyEnv: "KIMI_API_KEY",
        defaultBaseUrl: "https://api.kimi.com/coding/v1",
    },
    gpt: {
        provider: "kimi-cli-compat",
        baseUrlEnv: "OPENAI_BASE_URL",
        apiKeyEnv: "OPENAI_API_KEY",
        defaultBaseUrl: "https://api.openai.com/v1",
    },
    gemini: {
        provider: "kimi-cli-compat",
        baseUrlEnv: "GEMINI_BASE_URL",
        apiKeyEnv: "GEMINI_API_KEY",
        defaultBaseUrl: "https://api.gemini.com/v1",
    },
    opus: {
        provider: "anthropic",
        baseUrlEnv: "ANTHROPIC_BASE_URL",
        apiKeyEnv: "ANTHROPIC_API_KEY",
        defaultBaseUrl: "https://api.anthropic.com",
    },
    claude: {
        provider: "anthropic",
        baseUrlEnv: "ANTHROPIC_BASE_URL",
        apiKeyEnv: "ANTHROPIC_API_KEY",
        defaultBaseUrl: "https://api.anthropic.com",
    },
    deepseek: {
        provider: "kimi-cli-compat",
        baseUrlEnv: "DEEPSEEK_BASE_URL",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        defaultBaseUrl: "https://api.deepseek.com/v1",
    },
}

function resolvePrefixRule(model: string): ModelPrefixRule {
    const normalized = model.toLowerCase();
    const matchedPrefix = Object.keys(MODEL_PREFIX_RULES)
        .filter((prefix) => normalized.startsWith(prefix))
        .sort((a, b) => b.length - a.length)[0];

    if (!matchedPrefix) {
        throw new Error(`Unknown model: ${model}`);
    }

    return MODEL_PREFIX_RULES[matchedPrefix]!;
}

export function resolveModel(model: string): ModelConfig {
    const rule = resolvePrefixRule(model);
    const modelConfig = {
        provider: rule.provider,
        baseUrl: process.env[rule.baseUrlEnv] ?? rule.defaultBaseUrl,
        apiKey: process.env[rule.apiKeyEnv] ?? "",
        model,
    };
    return modelConfig;
}

export function getProvider(config: ModelConfig): Provider {
    switch (config.provider) {
        case "kimi-cli-compat":
            return getKimiCLICompatProvider(config.model, config.baseUrl, config.apiKey);
        case "anthropic":
            return getAnthropicProvider(config.model, config.baseUrl, config.apiKey);
        default:
            throw new Error(`Unknown provider: ${(config as ModelConfig).provider}`);
    }
}
