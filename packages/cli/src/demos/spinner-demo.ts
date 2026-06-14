
// TUI spinner

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
process.stdout.on("resize", () => {
    process.stdout.write(`\x1b[2J\x1b[H`);
});
process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
});
process.stdout.write(`\x1b[2J\x1b[H`);

function setSpinner(row: number, ms: number) {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    setInterval(() => {
        process.stdout.write(`\x1b[${row};1H${frames[i]} Loading...\x1b[?25l`);
        process.stdout.write(`\x1b[K`);
        i = (i + 1) % frames.length;
    }, ms);
}

for (let ms = 50; ms < 500; ms = ms+50) {
    setSpinner(Math.floor(ms / 50), ms);
}