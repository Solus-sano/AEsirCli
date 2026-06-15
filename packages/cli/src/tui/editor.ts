
export class Editor {
    private lines: string[] = [];
    private cursorRow: number = 0;
    private cursorCol: number = 0;

    constructor(private onSubmit?: (text: string) => void) {
        this.clear();
    }

    /**
     * 渲染编辑器
     * @param width 宽度
     * @returns 渲染后的行
     */
    render(width: number): string[] {
        return this.lines.map((line, index) => {
            const prefix = index === 0 ? "\x1b[32m> \x1b[0m" : "  ";
            if (index === this.cursorRow) {
                const before = line.slice(0, this.cursorCol);
                const cursor = line[this.cursorCol] ?? " ";
                const after = line.slice(this.cursorCol + 1);
                return `${prefix}${before}\x1b[7m${cursor}\x1b[0m${after}`;
            }
            return `${prefix}${line}`;
        });
    }

    getText(): string {
        return this.lines.join("\n");
    }

    handleInput(data: string): void {
        if (data === "\r") {
            this.submit();
        } else if (data === "\x1b[A") {
            this.moveUp();
        } else if (data === "\x1b[B") {
            this.moveDown();
        } else if (data === "\x1b[C") {
            this.moveRight();
        } else if (data === "\x1b[D") {
            this.moveLeft();
        } else if (data === "\n" || data === "\x1b[13;2u") {
            this.insertNewLine();
        } else if (data === "\x7f") {
            this.deleteChar();
        } else {
            const currentLine = this.lines[this.cursorRow] ?? "";
            this.lines[this.cursorRow] = currentLine.slice(0, this.cursorCol) + data + currentLine.slice(this.cursorCol);
            this.cursorCol += data.length;
        }
    }

    private submit(): void {
        this.onSubmit?.(this.getText());
        this.clear();
    }

    private moveUp(): void {
        if (this.cursorRow > 0) {
            this.cursorRow--;
            this.cursorCol = Math.min(this.cursorCol, (this.lines[this.cursorRow] ?? "").length);
        }
    }

    private moveDown(): void {
        if (this.cursorRow < this.lines.length - 1) {
            this.cursorRow++;
            this.cursorCol = Math.min(this.cursorCol, (this.lines[this.cursorRow] ?? "").length);
        }
    }

    private moveRight(): void {
        const lineLen = (this.lines[this.cursorRow] ?? "").length;
        if (this.cursorCol < lineLen) {
            this.cursorCol++;
        }
    }

    private moveLeft(): void {
        if (this.cursorCol > 0) {
            this.cursorCol--;
        }
    }

    private insertNewLine(): void {
        const line = this.lines[this.cursorRow] ?? "";
        this.lines[this.cursorRow] = line.slice(0, this.cursorCol);
        this.lines.splice(this.cursorRow + 1, 0, line.slice(this.cursorCol));
        this.cursorRow++;
        this.cursorCol = 0;
    }

    private deleteChar(): void {
        if (this.cursorCol > 0) {
            const line = this.lines[this.cursorRow] ?? "";
            this.lines[this.cursorRow] = line.slice(0, this.cursorCol - 1) + line.slice(this.cursorCol);
            this.cursorCol--;
        } else if (this.cursorRow > 0) {
            const prevLine = this.lines[this.cursorRow - 1] ?? "";
            const curLine = this.lines[this.cursorRow] ?? "";
            this.cursorCol = prevLine.length;
            this.lines[this.cursorRow - 1] = prevLine + curLine;
            this.lines.splice(this.cursorRow, 1);
            this.cursorRow--;
        }
    }

    private clear(): void {
        this.lines = [""];
        this.cursorRow = 0;
        this.cursorCol = 0;
    }
}   