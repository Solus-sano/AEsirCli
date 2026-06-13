import path from "path";





export async function resolveSafePath(
    inputPath: string,
    cwd?: string
): Promise<string> {
    const workspaceRoot = path.resolve(cwd ?? process.cwd());
    const absPath = path.resolve(workspaceRoot, inputPath);
    const prefix = workspaceRoot.endsWith(path.sep)
        ? workspaceRoot
        : workspaceRoot + path.sep;

    if (absPath !== workspaceRoot && !absPath.startsWith(prefix)) {
        throw new Error(`Path ${absPath} is outside workspace ${workspaceRoot}`);
    }

    return absPath;
}
