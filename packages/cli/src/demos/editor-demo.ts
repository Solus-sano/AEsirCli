import { Screen } from "../tui/screen.js";
import { Editor } from "../tui/editor.js";


function cleanup() {
    process.stdout.write(`\x1b[?25h`);
    process.stdin.setRawMode(false);
}
process.stdin.setRawMode(true); 
process.stdout.write(`\x1b[2J\x1b[H\x1b[?25l`);  // 清屏 + 隐藏光标


const screen = new Screen();
const editor = new Editor((text) => {
    screen.render([text]);
});

process.stdin.on('data', (data) => {
    const key = data.toString();
    if (key === "\x03") {  // 只留 Ctrl+C 退出，q 是正常字符
        cleanup();
        process.exit(0);
    }
    editor.handleInput(key);
    screen.render(editor.render(process.stdout.columns));
});