

export async function* parseSSE(
    body: ReadableStream<Uint8Array>
): AsyncGenerator<{data: string}> {
    let stringBuffer: string = "";
    const splitText: string = "\n\n"
    const reader = body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stringBuffer += decoder.decode(value, { stream: true });
        // console.log('\x1b[33m%s\x1b[0m', stringBuffer);

        let sepIndex: number;
        while(
            (sepIndex = stringBuffer.indexOf(splitText)) !== -1) 
        {
            const dataStr = stringBuffer.slice(0, sepIndex);
            stringBuffer = stringBuffer.slice(sepIndex + 2);

            if (!dataStr.startsWith("data:")) {
                continue;
            }

            const data = dataStr.slice(5).trim();
            if (data === "[DONE]") return;
            yield { data: data };
        } 
    }
}