import { Screen } from "../tui/screen.js";

const screen = new Screen();


function cleanup() {
    process.stdout.write(`\x1b[?25h`);
    process.stdin.setRawMode(false);
}

process.stdin.setRawMode(true); 
process.stdin.on('data', (data) => {
    const key = data.toString();
    if (key === "q" || key === "\x03") {
        cleanup();
        process.exit(0);
    }
});
process.stdout.write(`\x1b[2J\x1b[H`);
setInterval(() => {
    screen.render([
        "Welcome to aesir-cli",
        "This line never changes",
        "Another static line",
        "",
        `Current time: ${new Date().toLocaleTimeString()}`,
    ]);
}, 100);