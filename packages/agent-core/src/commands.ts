import type { RegisteredCommand } from "./extensions/types.js";


function renderCommand(command: RegisteredCommand) {
    return `/${command.name}: ${command.description ?? "(no description)"}`;
}

export function registerBuiltinCommands(registry: Map<string, RegisteredCommand>) {
    registry.set("help", {
        name: "help",
        description: "list all available commands",
        handler: async () => {
            const lines: string[] = [];
            for (const command of registry.values()) {
                lines.push(renderCommand(command));
            }
            return lines.join("\n");
        },
    });

    registry.set("quit", {
        name: "quit",
        description: "exit the program",
        handler: async () => {
            process.exit(0);
        },
    });
}

export function isSlashCommand(input: string): boolean {
    return input.startsWith("/");
}

export async function executeCommand(
    input: string,
    registry: Map<string, RegisteredCommand>
): Promise<string | null> {
    if (!isSlashCommand(input)) {
        return null;
    }
    const trimmed = input.slice(1).trim();
    const spaceIndex = trimmed.indexOf(" ");
    const commandName = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
    const args = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();

    const command = registry.get(commandName);
    if (!command) {
        return `Unknown command: /${commandName}. Type /help for available commands.`;
    }
    const result = await command.handler(args);
    return result ?? null;
}
