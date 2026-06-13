export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
}


export function ok<T>(value: T): Result<T, never> {
    const res: Result<T, never> = {
        ok: true,
        value: value,
    }
    return res;
}

export function err<E>(error: E): Result<never, E> {
    const res: Result<never, E> = {
        ok: false,
        error: error,
    }
    return res;
}

export function safeJsonParse(s: string): Result<unknown, Error> {
    try {
        const json_str = JSON.parse(s);
        return ok(json_str);
    } catch (error) {
        return err(error as Error);
    }
}
