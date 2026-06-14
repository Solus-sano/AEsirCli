export { visibleWidth, stripAnsi } from "./utils.js";

export class Screen {
    private prevLines: string[] = [];
    private width: number;
    private height: number;

    constructor() {
        this.width = process.stdout.columns;
        this.height = process.stdout.rows;
    }

    render(lines: string[]): void {
        /**
         * 逐行对比 lines vs prevLines
         * 不同的行 → write("\x1b[{row};1H{content}\x1b[K")
         * 新帧比旧帧短 → 多出的旧行清空
         * 保存 prevLines = [...lines]
         */
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