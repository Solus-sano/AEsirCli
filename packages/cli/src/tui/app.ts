import { Screen } from "./screen.js";
import { Editor } from "./editor.js";
import { charDisplayWidth, visibleWidth } from "./utils.js";
import type { ChatMessage, LLMEvent, Provider } from "@aesir/ai";
import { SessionManager } from "@aesir/agent-core";
import { abortCurrentTurn, isAgentRunning } from "./handler.js";

const INPUT_HEIGHT = 3;
const STATUS_HEIGHT = 1;
const SEPARATOR_HEIGHT = 1;
// const ENTER_ALTERNATE_SCREEN = "\x1b[?1049h";
// const EXIT_ALTERNATE_SCREEN = "\x1b[?1049l";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENABLE_MOUSE_TRACKING = "\x1b[?1006h\x1b[?1000h";
const DISABLE_MOUSE_TRACKING = "\x1b[?1006l\x1b[?1000l";
const ENABLE_ALTERNATE_SCROLL = "\x1b[?1007h";
const DISABLE_ALTERNATE_SCROLL = "\x1b[?1007l";

export class TUIApp {
    private screen: Screen;
    private editor: Editor;
    private conversationMessages: ChatMessage[] = [];
    private conversationLines: string[] = [];
    private sessionManager: SessionManager;
    private sessionId: string;
    private LLMProvider: Provider;
    private modelName: string;
    private inThinking = false;
    private scrollOffset = 0;
    private stopped = false;
    private pendingToolArgs = "";
    private pendingToolName = "";
    private usagePromptTokens: number | null = null;
    private usageCompletionTokens: number | null = null;
    private usageCachedTokens: number | null = null;

    constructor(
        screen: Screen, 
        tmpSessionManager: SessionManager, 
        sessionId: string,
        LLMProvider: Provider,
        options?: {
            modelName?: string;
            onUserMessage?: (
                messages: ChatMessage[], 
                sessionManager: SessionManager, 
                sessionId: string, 
                LLMProvider: Provider,
                renderFn: (event: LLMEvent) => void
            ) => Promise<void> | void;
        }
    ) {
        this.screen = screen;
        this.sessionManager = tmpSessionManager;
        this.sessionId = sessionId;
        this.LLMProvider = LLMProvider;
        this.modelName = options?.modelName ?? "unknown";
        const onUserMessage = options?.onUserMessage;

        this.editor = new Editor(
            (text) => {
                this.conversationLines.push(`\x1b[36m> ${text}\x1b[0m`);
                this.conversationLines.push("");
                this.conversationMessages.push({ role: "user", content: text });
                this.scrollToBottom();
                this.render();
                const p = onUserMessage?.(
                    this.conversationMessages,
                    this.sessionManager,
                    this.sessionId,
                    this.LLMProvider,
                    this.tuiRenderLLMStreamEvent
                );
                if (p instanceof Promise) {
                    p.catch((err: unknown) => {
                        this.appendStreamingText(`\x1b[31mError: ${err instanceof Error ? err.message : String(err)}\x1b[0m\n`);
                    });
                }
            }
        );
    }

    handleInput(text: string): void {
        if (this.tryHandleScroll(text)) {
            return;
        }
        this.editor.handleInput(text);
    }

    private tryHandleScroll(text: string): boolean {
        if (text === "\x1b[5~") {
            this.scrollUp();
            this.render();
            return true;
        }
        if (text === "\x1b[6~") {
            this.scrollDown();
            this.render();
            return true;
        }
        if (text === "\x1b[1;2A" || text === "\x1b[1;2B") {
            if (text === "\x1b[1;2A") {
                this.scrollUp();
            } else {
                this.scrollDown();
            }
            this.render();
            return true;
        }
        if (text.startsWith("\x1b[<64;") || (text.startsWith("\x1b[M") && text.charCodeAt(3) === 36)) {
            this.scrollUp();
            this.render();
            return true;
        }
        if (text.startsWith("\x1b[<65;") || (text.startsWith("\x1b[M") && text.charCodeAt(3) === 37)) {
            this.scrollDown();
            this.render();
            return true;
        }
        // Alternate scroll mode maps wheel to arrow keys on some terminals.
        if (this.editor.isSingleLine() && (text === "\x1b[A" || text === "\x1b[B")) {
            if (text === "\x1b[A") {
                this.scrollUp();
            } else {
                this.scrollDown();
            }
            this.render();
            return true;
        }
        return false;
    }

    start(): void {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdout.write(`${CLEAR_SCREEN}${HIDE_CURSOR}${ENABLE_MOUSE_TRACKING}${ENABLE_ALTERNATE_SCROLL}`);
        this.render();

        process.stdin.on('data', (data) => {
            const key = data.toString();
            if (key === "\x03") {
                if (isAgentRunning()) {
                    abortCurrentTurn();
                } else {
                    this.stop();
                    process.exit(0);
                }
                return;
            }
            this.handleInput(key);
            this.render();
        });

        process.stdout.on("resize", () => {
            this.screen.invalidate();
            this.render();
        });

        process.on("exit", () => this.stop());
        process.on("uncaughtException", (err) => {
            this.stop();
            console.error(err);
            process.exit(1);
        });
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        process.stdout.write(`\x1b[0m${DISABLE_MOUSE_TRACKING}${DISABLE_ALTERNATE_SCROLL}${SHOW_CURSOR}`);
        process.stdin.setRawMode(false);
        process.stdin.pause();
    }

    private scrollUp(): void {
        const chatHeight = this.getChatHeight();
        const cols = process.stdout.columns;
        const displayLineCount = this.getWrappedConversationLines(cols).length;
        const maxOffset = Math.max(0, displayLineCount - chatHeight);
        this.scrollOffset = Math.min(this.scrollOffset + 5, maxOffset);
    }

    private scrollDown(): void {
        this.scrollOffset = Math.max(0, this.scrollOffset - 5);
    }

    private scrollToBottom(): void {
        this.scrollOffset = 0;
    }

    private getChatHeight(): number {
        return process.stdout.rows - INPUT_HEIGHT - STATUS_HEIGHT - SEPARATOR_HEIGHT;
    }

    private getWrappedConversationLines(cols: number): string[] {
        return this.conversationLines.flatMap((line) => this.wrapLine(line, cols));
    }

    private getChatLines(chatHeight: number, cols: number): string[] {
        const displayLines = this.getWrappedConversationLines(cols);
        const end = displayLines.length - this.scrollOffset;
        const start = Math.max(0, end - chatHeight);
        const visible = displayLines.slice(start, end);

        while (visible.length < chatHeight) {
            visible.unshift("");
        }
        return visible;
    }

    private getStatusLine(cols: number): string {
        const model = `\x1b[34m[${this.modelName}]\x1b[0m`;
        const scrollInfo = this.scrollOffset > 0
            ? `\x1b[33m [↑${this.scrollOffset}]\x1b[0m`
            : "";
        const usageInfo = this.usagePromptTokens !== null
            ? `\x1b[2m\x1b[34m ${this.usagePromptTokens} in / ${this.usageCompletionTokens} out / ${this.usageCachedTokens} cached\x1b[0m`
            : "";
        const hint = `\x1b[90mEnter:send | Shift+Enter:newline\x1b[0m`;
        return ` ${model}${scrollInfo}${usageInfo}  ${hint}`;
    }

    render(): void {
        const cols = process.stdout.columns;
        const chatHeight = this.getChatHeight();
        const displayLineCount = this.getWrappedConversationLines(cols).length;
        const maxOffset = Math.max(0, displayLineCount - chatHeight);
        this.scrollOffset = Math.min(this.scrollOffset, maxOffset);

        const chatLines = this.getChatLines(chatHeight, cols);
        const separator = ["─".repeat(cols)];
        const editorLines = this.padLines(this.editor.render(cols), INPUT_HEIGHT);
        const statusLine = [this.truncateLine(this.getStatusLine(cols), cols)];

        const frameLines = [...chatLines, ...separator, ...editorLines, ...statusLine];
        this.screen.render(frameLines);
    }

    private wrapLine(line: string, maxCols: number): string[] {
        if (maxCols <= 0) return [line];
        if (line === "") return [""];
        if (visibleWidth(line) <= maxCols) return [line];

        const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
        const wrapped: string[] = [];
        let result = "";
        let activeStyle = "";
        let width = 0;
        let lastIndex = 0;

        const pushLine = () => {
            wrapped.push(result + "\x1b[0m");
            result = activeStyle;
            width = 0;
        };

        while (lastIndex < line.length) {
            ANSI_RE.lastIndex = lastIndex;
            const match = ANSI_RE.exec(line);
            const nextAnsiStart = match ? match.index : line.length;

            for (let i = lastIndex; i < nextAnsiStart; i++) {
                const code = line.codePointAt(i)!;
                const charStr = String.fromCodePoint(code);
                const cw = charDisplayWidth(code);

                if (width + cw > maxCols && result.length > activeStyle.length) {
                    pushLine();
                }

                width += cw;
                result += charStr;
                if (code > 0xffff) i++;
            }

            if (match) {
                const seq = match[0];
                result += seq;
                if (seq === "\x1b[0m") {
                    activeStyle = "";
                } else if (seq.endsWith("m")) {
                    activeStyle += seq;
                }
                lastIndex = ANSI_RE.lastIndex;
            } else {
                break;
            }
        }

        if (result.length > 0 || wrapped.length === 0) {
            wrapped.push(result + "\x1b[0m");
        }

        return wrapped;
    }

    private truncateLine(line: string, maxCols: number): string {
        if (visibleWidth(line) <= maxCols) return line;

        const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
        let result = "";
        let width = 0;
        let lastIndex = 0;

        while (lastIndex < line.length) {
            ANSI_RE.lastIndex = lastIndex;
            const match = ANSI_RE.exec(line);
            const nextAnsiStart = match ? match.index : line.length;

            for (let i = lastIndex; i < nextAnsiStart; i++) {
                const code = line.codePointAt(i)!;
                const charStr = String.fromCodePoint(code);
                const cw = charDisplayWidth(code);

                if (width + cw > maxCols - 1) {
                    return result + "\x1b[0m…";
                }
                width += cw;
                result += charStr;
                if (code > 0xffff) i++;
            }

            if (match) {
                result += match[0];
                lastIndex = ANSI_RE.lastIndex;
            } else {
                break;
            }
        }

        return result + "\x1b[0m";
    }

    private padLines(lines: string[], targetHeight: number): string[] {
        const result = lines.slice(0, targetHeight);
        while (result.length < targetHeight) {
            result.push("");
        }
        return result;
    }

    // 流式输出时，逐字追加到 conversationLines 最后一行
    appendStreamingText(text: string): void {
        const parts = text.split("\n");
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
                // 追加到最后一行
                this.conversationLines[this.conversationLines.length - 1] += parts[i]!;
            } else {
                // 换行 → 新增一行
                this.conversationLines.push(parts[i]!);
            }
        }
        this.render();
    }

    private endThinking(): void {
        if (this.inThinking) {
            this.inThinking = false;
            this.appendStreamingText(`\x1b[0m\n`);
        }
    }

    private flushPendingTool(): void {
        if (this.pendingToolName) {
            let argSummary = "";
            try {
                const parsed = JSON.parse(this.pendingToolArgs);
                // Show a compact version of the args
                if (parsed.command) argSummary = parsed.command;
                else if (parsed.pattern) argSummary = parsed.pattern;
                else if (parsed.path) argSummary = parsed.path;
                else argSummary = this.pendingToolArgs.slice(0, 60);
            } catch {
                argSummary = this.pendingToolArgs.slice(0, 60);
            }
            this.appendStreamingText(`\x1b[90m⚙ ${this.pendingToolName}: ${argSummary}\x1b[0m\n`);
            this.pendingToolName = "";
            this.pendingToolArgs = "";
        }
    }

    tuiRenderLLMStreamEvent = (event: LLMEvent) => {
        if (event.type === "reasoning-delta") {
            if (!this.inThinking) {
                this.inThinking = true;
                this.appendStreamingText(`\x1b[2m\x1b[36m❯ thinking...\n`);
            }
            this.appendStreamingText(event.text);
        } else if (event.type === "text-delta") {
            this.endThinking();
            this.flushPendingTool();
            this.appendStreamingText(event.text);
        } else if (event.type === "tool-call-start") {
            this.endThinking();
            this.flushPendingTool();
            this.pendingToolName = event.name;
            this.pendingToolArgs = "";
        } else if (event.type === "tool-call-delta") {
            this.pendingToolArgs += event.argDelta;
        } else if (event.type === "usage") {
            this.endThinking();
            this.flushPendingTool();
            this.usagePromptTokens = event.usage.prompt_tokens;
            this.usageCompletionTokens = event.usage.completion_tokens;
            this.usageCachedTokens = event.usage.cached_tokens
                ?? event.usage.prompt_cache_hit_tokens
                ?? event.usage.prompt_tokens_details?.cached_tokens
                ?? 0;
            this.render();
        } else if (event.type === "done") {
            this.endThinking();
            this.flushPendingTool();
            this.appendStreamingText(`\n`);
        }
    }
}
