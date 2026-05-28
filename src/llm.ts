import process from "node:process";



const CodingAgentHeader = {
    "User-Agent": process.env.MODEL_USER_AGENT as string,
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "X-Title": "Kimi CLI",
    "HTTP-Referer": "https://kimi.com/code",
    "Content-Type": "application/json",
}

type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
}

type ChatCompletionResponse = {
    "choices": {
        "message": ChatMessage;
        "finish_reason": "stop" | "length" | "toolUse" | "error" | "aborted";
    }[];
    "usage": {
        "prompt_tokens": number;
        "completion_tokens": number;
        "total_tokens": number;
    };
}

export async function chat(messages: ChatMessage[]): Promise<string> {
    const postJson = {
        "model": process.env.MODEL,
        "messages": messages,
        "stream": false
        // "temperature": process.env.TEMPRETURE,
    }

    const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: CodingAgentHeader,
        body: JSON.stringify(postJson),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const CompleteData = await response.json() as ChatCompletionResponse;


    const FirstChoices = CompleteData.choices[0];
    if (!FirstChoices) {
        throw new Error("No message in response");
    }
    return FirstChoices.message.content;
}