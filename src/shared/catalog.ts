/**
 * What the studio knows how to run for each language: language servers (LSP), debuggers (DAP) and test runners.
 * Plain data; installed extensions add entries through their `ventriee.*` contribution keys.
 */
export type PerOs = string | Partial<Record<'win32' | 'darwin' | 'linux' | 'default', string>>
export interface InstallSpec { command?: PerOs; url?: string }
export interface ServerSpec { name: string; command: string; args?: string[]; initializationOptions?: unknown }
export interface LanguageSpec { id: string; name: string; servers: ServerSpec[]; install?: InstallSpec }
export interface DebuggerSpec {
  id: string; name: string; languages: string[]
  /** `${port}` in args means the adapter listens on TCP instead of stdio. */
  command: string; args?: string[]
  /** The DAP launch arguments for "debug the current file"; launch.json replaces them. */
  launch: Record<string, unknown>
  install?: InstallSpec
}
export interface TestRunnerSpec {
  id: string; name: string
  /** Files whose presence (or package.json dependency, as `package.json:<dep>`) marks a project as using this runner. */
  detect: string[]
  command: string; args: string[]
  /** Extra args to run one file (`${file}`) or one test by name (`${name}`). */
  fileArgs?: string[]; nameArgs?: string[]
  report: 'junit' | 'jest-json' | 'go-json' | 'cargo-text'
}
export type LspStatus = { state: 'ready'; server: string; capabilities: Record<string, unknown> } | { state: 'missing'; language: string; install?: string; url?: string } | { state: 'none' }
export interface LspEvent { language: string; method: string; params: unknown }
export interface Catalog { languages: LanguageSpec[]; debuggers: DebuggerSpec[]; testRunners: TestRunnerSpec[] }

export const baseCatalog: Catalog = {
  languages: [
    { id: 'python', name: 'Python', servers: [{ name: 'basedpyright', command: 'basedpyright-langserver', args: ['--stdio'] }, { name: 'pyright', command: 'pyright-langserver', args: ['--stdio'] }, { name: 'pylsp', command: 'pylsp' }],
      install: { command: { win32: 'python -m pip install basedpyright', default: 'python3 -m pip install basedpyright' } } },
    { id: 'go', name: 'Go', servers: [{ name: 'gopls', command: 'gopls' }], install: { command: 'go install golang.org/x/tools/gopls@latest' } },
    { id: 'rust', name: 'Rust', servers: [{ name: 'rust-analyzer', command: 'rust-analyzer' }], install: { command: 'rustup component add rust-analyzer' } },
    { id: 'c', name: 'C', servers: [{ name: 'clangd', command: 'clangd', args: ['--background-index'] }], install: { command: { win32: 'winget install LLVM.LLVM', darwin: 'brew install llvm', linux: 'sudo apt install clangd' } } },
    { id: 'cpp', name: 'C++', servers: [{ name: 'clangd', command: 'clangd', args: ['--background-index'] }], install: { command: { win32: 'winget install LLVM.LLVM', darwin: 'brew install llvm', linux: 'sudo apt install clangd' } } },
    { id: 'java', name: 'Java', servers: [{ name: 'jdtls', command: 'jdtls' }], install: { command: { darwin: 'brew install jdtls' }, url: 'https://github.com/eclipse-jdtls/eclipse.jdt.ls#installation' } },
    { id: 'php', name: 'PHP', servers: [{ name: 'intelephense', command: 'intelephense', args: ['--stdio'] }], install: { command: 'npm install -g intelephense' } },
    { id: 'ruby', name: 'Ruby', servers: [{ name: 'ruby-lsp', command: 'ruby-lsp' }, { name: 'solargraph', command: 'solargraph', args: ['stdio'] }], install: { command: 'gem install ruby-lsp' } },
    { id: 'csharp', name: 'C#', servers: [{ name: 'csharp-ls', command: 'csharp-ls' }], install: { command: 'dotnet tool install --global csharp-ls' } },
    { id: 'kotlin', name: 'Kotlin', servers: [{ name: 'kotlin-language-server', command: 'kotlin-language-server' }], install: { url: 'https://github.com/fwcd/kotlin-language-server' } },
    { id: 'lua', name: 'Lua', servers: [{ name: 'lua-language-server', command: 'lua-language-server' }], install: { command: { win32: 'winget install LuaLS.lua-language-server', darwin: 'brew install lua-language-server' } } },
    { id: 'shell', name: 'Shell', servers: [{ name: 'bash-language-server', command: 'bash-language-server', args: ['start'] }], install: { command: 'npm install -g bash-language-server' } },
    { id: 'yaml', name: 'YAML', servers: [{ name: 'yaml-language-server', command: 'yaml-language-server', args: ['--stdio'] }], install: { command: 'npm install -g yaml-language-server' } },
    { id: 'dockerfile', name: 'Dockerfile', servers: [{ name: 'docker-langserver', command: 'docker-langserver', args: ['--stdio'] }], install: { command: 'npm install -g dockerfile-language-server-nodejs' } }
  ],
  debuggers: [
    { id: 'debugpy', name: 'Python (debugpy)', languages: ['python'], command: 'python', args: ['-m', 'debugpy.adapter'],
      launch: { request: 'launch', program: '${file}', cwd: '${workspaceFolder}', console: 'internalConsole', justMyCode: true },
      install: { command: { win32: 'python -m pip install debugpy', default: 'python3 -m pip install debugpy' } } },
    { id: 'delve', name: 'Go (Delve)', languages: ['go'], command: 'dlv', args: ['dap', '--listen=127.0.0.1:${port}'],
      launch: { request: 'launch', mode: 'debug', program: '${fileDirname}' }, install: { command: 'go install github.com/go-delve/delve/cmd/dlv@latest' } },
    { id: 'lldb', name: 'C, C++, Rust (LLDB)', languages: ['c', 'cpp', 'rust'], command: 'lldb-dap',
      launch: { request: 'launch', program: '${fileDirname}/${fileBasenameNoExtension}${exe}', cwd: '${workspaceFolder}' },
      install: { command: { win32: 'winget install LLVM.LLVM', darwin: 'xcode-select --install', linux: 'sudo apt install lldb' } } }
  ],
  testRunners: [
    { id: 'vitest', name: 'Vitest', detect: ['package.json:vitest'], command: 'npx', args: ['vitest', 'run', '--reporter=junit', '--outputFile=${report}'], fileArgs: ['${file}'], nameArgs: ['-t', '${name}'], report: 'junit' },
    { id: 'jest', name: 'Jest', detect: ['package.json:jest'], command: 'npx', args: ['jest', '--json', '--outputFile=${report}'], fileArgs: ['${file}'], nameArgs: ['-t', '${name}'], report: 'jest-json' },
    { id: 'pytest', name: 'pytest', detect: ['pytest.ini', 'conftest.py', 'pyproject.toml', 'tests'], command: 'python', args: ['-m', 'pytest', '--junitxml=${report}', '-q'], fileArgs: ['${file}'], nameArgs: ['-k', '${name}'], report: 'junit' },
    { id: 'go', name: 'go test', detect: ['go.mod'], command: 'go', args: ['test', '-json', './...'], nameArgs: ['-run', '${name}'], report: 'go-json' },
    { id: 'cargo', name: 'cargo test', detect: ['Cargo.toml'], command: 'cargo', args: ['test'], nameArgs: ['${name}'], report: 'cargo-text' }
  ]
}

export const forOs = (value: PerOs | undefined, platform: string): string | undefined =>
  typeof value === 'string' ? value : value?.[platform as 'win32'] ?? value?.default
