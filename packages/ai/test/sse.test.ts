import test from "node:test";
import assert from "node:assert/strict";
import { parseSSE } from "../src/sse.js";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

test("parseSSE parses data frames split across chunks", async () => {
    const stream = streamFromChunks([
        "data: {\"a\":",
        "1}\n\n",
        "data: {\"b\":2}\n\n",
        "data: [DONE]\n\n",
    ]);

    const frames: { data: string }[] = [];
    for await (const frame of parseSSE(stream)) {
        frames.push(frame);
    }

    assert.deepEqual(frames, [{ data: "{\"a\":1}" }, { data: "{\"b\":2}" }]);
});

test("parseSSE ignores non-data frames", async () => {
    const stream = streamFromChunks([
        "event: ping\n\n",
        "data: hello\n\n",
        ": comment\n\n",
        "data: [DONE]\n\n",
    ]);

    const frames: { data: string }[] = [];
    for await (const frame of parseSSE(stream)) {
        frames.push(frame);
    }

    assert.deepEqual(frames, [{ data: "hello" }]);
});
