const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(str: string): string {
    return str.replace(ANSI_RE, "");
}

function isWideChar(code: number): boolean {
    // CJK Unified Ideographs + common fullwidth ranges
    return (
        (code >= 0x1100 && code <= 0x115f) ||   // Hangul Jamo
        (code >= 0x2e80 && code <= 0x303e) ||   // CJK Radicals + Kangxi + Ideographic
        (code >= 0x3040 && code <= 0x33bf) ||   // Hiragana, Katakana, CJK Compat
        (code >= 0x3400 && code <= 0x4dbf) ||   // CJK Unified Ext A
        (code >= 0x4e00 && code <= 0xa4cf) ||   // CJK Unified + Yi
        (code >= 0xac00 && code <= 0xd7af) ||   // Hangul Syllables
        (code >= 0xf900 && code <= 0xfaff) ||   // CJK Compat Ideographs
        (code >= 0xfe30 && code <= 0xfe6f) ||   // CJK Compat Forms + Small Forms
        (code >= 0xff01 && code <= 0xff60) ||   // Fullwidth ASCII
        (code >= 0xffe0 && code <= 0xffe6) ||   // Fullwidth Signs
        (code >= 0x20000 && code <= 0x2fffd) || // CJK Ext B+
        (code >= 0x30000 && code <= 0x3fffd)    // CJK Ext G+
    );
}

export function visibleWidth(str: string): number {
    const stripped = stripAnsi(str);
    let width = 0;
    for (const ch of stripped) {
        const code = ch.codePointAt(0)!;
        width += isWideChar(code) ? 2 : 1;
    }
    return width;
}
