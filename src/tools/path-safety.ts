import path from "path";





export async function resolveSafePath(
    inputPath: string,
    cwd?: string
): Promise<string> {
    const absPath = path.resolve(cwd ?? process.cwd(), inputPath);
    const prefix = cwd ?? (process.cwd() + path.sep);

    if (absPath!=cwd && !absPath.startsWith(prefix)) {
        throw new Error(`Path ${absPath} is outside workspace ${cwd}`);
    }

    return absPath;
}