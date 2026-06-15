export { visibleWidth, stripAnsi } from "./utils.js";

export class Screen {
    private prevLines: string[] = [];
    private width: number;
    private height: number;

    constructor() {
        this.width = process.stdout.columns;
        this.height = process.stdout.rows;
    }

    invalidate(): void {
        this.prevLines = [];
    }

    render(lines: string[]): void {
        this.width = process.stdout.columns;
        this.height = process.stdout.rows;
        this.invalidate(); //bug

        for (let i = 0; i < lines.length; i++) {
            if (lines[i] !== this.prevLines[i]) {
                process.stdout.write(`\x1b[${i+1};1H${lines[i]}\x1b[K`);
            }
        }
        for (let i = lines.length; i < this.prevLines.length; i++) {
            process.stdout.write(`\x1b[${i+1};1H\x1b[K`);
        }
        this.prevLines = [...lines];
    }
}