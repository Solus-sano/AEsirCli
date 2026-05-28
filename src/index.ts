#!/usr/bin/env node

// import "dotenv/config";
import {chat} from "./llm.js";



async function main() {
    const r = await chat([{role: "user", content: "Hello, I'm Æsir"}]);
    console.log(r);
}

await main();