import * as fs from 'fs';

export type ClangdIssue =
    | 'NO_COMPILE_COMMANDS'
    | 'STALE_COMPILE_COMMANDS'
    | 'CROSS_COMPILE';

const CROSS_COMPILE_MARKERS = [
    'arm-none-eabi', 'arm-linux-gnueabi', 'arm-linux-gnueabihf',
    'riscv32', 'riscv64', 'riscv-none-elf',
    'aarch64-linux-gnu', 'aarch64-none-elf',
    'xtensa', 'mipsel', 'mips-',
];

export function detectCrossCompile(compileCommandsPath: string): string | null {
    try {
        const raw = fs.readFileSync(compileCommandsPath, 'utf8');
        for (const marker of CROSS_COMPILE_MARKERS) {
            if (raw.includes(marker)) { return marker; }
        }
    } catch { /* unreadable */ }
    return null;
}
