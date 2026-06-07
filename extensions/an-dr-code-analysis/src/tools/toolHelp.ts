export interface InstallCommand {
    platform: string;
    command: string;
}

export interface ToolHelp {
    name: string;
    description: string;
    affectsCapabilities: string[];
    installCommands: InstallCommand[];
    downloadUrl?: string;
    docsUrl?: string;
    notes?: string;
}

export const TOOL_HELP: Readonly<Record<string, ToolHelp>> = {
    tsserver: {
        name: 'tsserver',
        description: 'TypeScript language server bundled with VS Code. Provides call graph and import analysis for TypeScript and JavaScript.',
        affectsCapabilities: ['Call Graph (TypeScript/JS)', 'File Dependencies (TypeScript/JS)', 'Component Dependencies (TypeScript/JS)'],
        installCommands: [],
        notes: 'Built into VS Code — no installation required.',
    },
    clangd: {
        name: 'clangd',
        description: 'C/C++ language server based on LLVM/Clang. Provides high-confidence call graph and file dependency analysis.',
        affectsCapabilities: ['Call Graph (C/C++)', 'File Dependencies (C/C++)'],
        installCommands: [
            { platform: 'Windows (winget)', command: 'winget install LLVM.LLVM' },
            { platform: 'Windows (choco)', command: 'choco install llvm' },
            { platform: 'macOS (brew)', command: 'brew install llvm' },
            { platform: 'Ubuntu/Debian', command: 'sudo apt install clangd' },
            { platform: 'Fedora/RHEL', command: 'sudo dnf install clang-tools-extra' },
        ],
        downloadUrl: 'https://releases.llvm.org/',
        docsUrl: 'https://clangd.llvm.org/',
        notes: 'Requires compile_commands.json in the workspace root. Generate it with CMake (-DCMAKE_EXPORT_COMPILE_COMMANDS=ON) or bear.',
    },
    'rust-analyzer': {
        name: 'rust-analyzer',
        description: 'Rust language server. Provides call graph and module analysis for Rust projects.',
        affectsCapabilities: ['Call Graph (Rust)', 'File Dependencies (Rust)'],
        installCommands: [
            { platform: 'All platforms (rustup)', command: 'rustup component add rust-analyzer' },
        ],
        downloadUrl: 'https://rust-analyzer.github.io/',
        docsUrl: 'https://rust-analyzer.github.io/manual.html',
        notes: 'Requires a Rust toolchain installed via rustup.',
    },
    cargo: {
        name: 'cargo',
        description: 'Rust package manager. Used for component dependency analysis (crate graph) in Cargo workspaces.',
        affectsCapabilities: ['Component Dependencies (Rust)'],
        installCommands: [
            { platform: 'All platforms', command: 'curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh' },
            { platform: 'Windows (winget)', command: 'winget install Rustlang.Rustup' },
        ],
        downloadUrl: 'https://www.rust-lang.org/tools/install',
        docsUrl: 'https://doc.rust-lang.org/cargo/',
    },
    ctags: {
        name: 'ctags',
        description: 'Universal Ctags — generates tag files for source code. Used as a fallback call graph analyzer for all languages.',
        affectsCapabilities: ['Call Graph (fallback for all languages)'],
        installCommands: [
            { platform: 'Windows (winget)', command: 'winget install UniversalCtags.Ctags' },
            { platform: 'Windows (choco)', command: 'choco install universal-ctags' },
            { platform: 'macOS (brew)', command: 'brew install universal-ctags' },
            { platform: 'Ubuntu/Debian', command: 'sudo apt install universal-ctags' },
            { platform: 'Fedora/RHEL', command: 'sudo dnf install ctags' },
        ],
        downloadUrl: 'https://github.com/universal-ctags/ctags/releases',
        docsUrl: 'https://docs.ctags.io/',
        notes: 'Install Universal Ctags (not the legacy Exuberant Ctags).',
    },
    cscope: {
        name: 'cscope',
        description: 'Source code browser for C-like languages. Used as an alternative fallback for call graph analysis.',
        affectsCapabilities: ['Call Graph (fallback for C/C++)'],
        installCommands: [
            { platform: 'macOS (brew)', command: 'brew install cscope' },
            { platform: 'Ubuntu/Debian', command: 'sudo apt install cscope' },
            { platform: 'Fedora/RHEL', command: 'sudo dnf install cscope' },
            { platform: 'Windows', command: 'Use WSL: sudo apt install cscope' },
        ],
        downloadUrl: 'http://cscope.sourceforge.net/',
    },
    pyan3: {
        name: 'pyan3',
        description: 'Python call graph generator using static analysis. Provides medium-confidence call graphs for Python code.',
        affectsCapabilities: ['Call Graph (Python)'],
        installCommands: [
            { platform: 'All platforms (pip)', command: 'pip install pyan3' },
            { platform: 'All platforms (pipx)', command: 'pipx install pyan3' },
        ],
        downloadUrl: 'https://github.com/davidfraser/pyan',
        docsUrl: 'https://github.com/davidfraser/pyan#readme',
    },
    cmake: {
        name: 'cmake',
        description: 'Cross-platform build system generator. Used for component dependency graph via CMake target analysis.',
        affectsCapabilities: ['Component Dependencies (C/C++)'],
        installCommands: [
            { platform: 'Windows (winget)', command: 'winget install Kitware.CMake' },
            { platform: 'Windows (choco)', command: 'choco install cmake' },
            { platform: 'macOS (brew)', command: 'brew install cmake' },
            { platform: 'Ubuntu/Debian', command: 'sudo apt install cmake' },
            { platform: 'Fedora/RHEL', command: 'sudo dnf install cmake' },
        ],
        downloadUrl: 'https://cmake.org/download/',
        docsUrl: 'https://cmake.org/documentation/',
    },
    bear: {
        name: 'bear',
        description: 'Build EAR — intercepts compiler calls to generate compile_commands.json for non-CMake projects.',
        affectsCapabilities: ['Enables clangd for make/autotools projects'],
        installCommands: [
            { platform: 'macOS (brew)', command: 'brew install bear' },
            { platform: 'Ubuntu/Debian', command: 'sudo apt install bear' },
            { platform: 'Fedora/RHEL', command: 'sudo dnf install bear' },
            { platform: 'Windows', command: 'Not officially supported. Use WSL or switch to CMake.' },
        ],
        downloadUrl: 'https://github.com/rizsotto/Bear/releases',
        docsUrl: 'https://github.com/rizsotto/Bear#readme',
        notes: 'Usage: run `bear -- make` instead of `make` to generate compile_commands.json.',
    },
    importlab: {
        name: 'importlab',
        description: 'Python import dependency analyzer from Google. Used for file dependency analysis in Python projects.',
        affectsCapabilities: ['File Dependencies (Python)'],
        installCommands: [
            { platform: 'All platforms (pip)', command: 'pip install importlab' },
        ],
        downloadUrl: 'https://github.com/google/importlab',
        docsUrl: 'https://github.com/google/importlab#readme',
    },
    iwyu: {
        name: 'iwyu',
        description: 'Include What You Use — analyzes C/C++ #include directives and suggests optimizations.',
        affectsCapabilities: ['File Dependencies (C/C++)', 'Header include optimization'],
        installCommands: [
            { platform: 'macOS (brew)', command: 'brew install include-what-you-use' },
            { platform: 'Ubuntu/Debian', command: 'sudo apt install iwyu' },
            { platform: 'Fedora/RHEL', command: 'sudo dnf install include-what-you-use' },
            { platform: 'Windows (choco)', command: 'choco install include-what-you-use' },
        ],
        downloadUrl: 'https://include-what-you-use.org/',
        docsUrl: 'https://github.com/include-what-you-use/include-what-you-use/blob/master/README.md',
        notes: 'Requires clangd/LLVM to be installed. Must match the LLVM version of clangd.',
    },
};
