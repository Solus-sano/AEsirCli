import { getProvider, resolveModel } from "@aesir/ai";
import { TUIApp } from "../tui/app.js";
import { Screen } from "../tui/screen.js";
import { SessionManager } from "@aesir/agent-core";
import { onUserMessage } from "../tui/handler.js";

const screen = new Screen();
const sessionManager = new SessionManager();
const sessionId = "123";
const modelConfig = resolveModel("kimi-k2.6");
const app = new TUIApp(
    screen,
    sessionManager,
    sessionId,
    getProvider(modelConfig),
    { modelName: "kimi-k2.7", onUserMessage }
);

app.start();