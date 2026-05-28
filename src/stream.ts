


export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((res, rej) => {
        if (signal.aborted) { rej(new Error("Aborted")); return; }

        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            res();
        }, ms);

        const onAbort = () => {
            clearTimeout(timer);
            rej(new Error("Aborted"));
        }

        signal.addEventListener("abort", onAbort, { once: true });
    });

}

export async function* fakeStream(signal: AbortSignal): AsyncIterable<string> {
    try {
        for (let i=0; i<10; i++) {
            await sleep(200, signal);
            yield `tok-${i}`;
        }
    } catch (error) {
        if (error instanceof Error && error.message === "Aborted") {
            return;
        }
        throw error;
    }
    
}