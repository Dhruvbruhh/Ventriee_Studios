import { monaco, languageFor } from './monaco'
import type { ProjectTypes } from '../../../shared/workspace'

/** The URI every project file has in the editor, open or not, so the TypeScript service links them. */
export const fileUri = (projectId: string, path: string) => monaco.Uri.from({ scheme: 'inmemory', authority: projectId, path: `/${path}` })

const JSX: Record<string, number> = { preserve: 1, react: 2, 'react-native': 3, 'react-jsx': 4, 'react-jsxdev': 5 }

/**
 * Teach Monaco's TypeScript service about the whole project: compiler options from
 * tsconfig, declared packages' type declarations, and every source file as a model.
 * Returns the background models it created, for the caller to dispose.
 */
export function applyProjectTypes(projectId: string, types: ProjectTypes): monaco.editor.ITextModel[] {
  const ts = monaco.typescript
  const o = types.compilerOptions
  const base = fileUri(projectId, '').toString()
  const options: monaco.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: true, checkJs: o.checkJs === true, strict: o.strict === true, jsx: JSX[String(o.jsx ?? 'react-jsx').toLowerCase()] ?? JSX['react-jsx'],
    esModuleInterop: true, allowSyntheticDefaultImports: true, resolveJsonModule: true, skipLibCheck: true, allowNonTsExtensions: true,
    ...(o.paths && typeof o.paths === 'object' ? { baseUrl: `${base}${String(o.baseUrl ?? '.').replace(/^\.\/?/, '')}`, paths: o.paths as Record<string, string[]> } : {})
  }
  const libs = types.libs.map((l) => ({ content: l.text, filePath: fileUri(projectId, l.path).toString() }))
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(options)
    defaults.setExtraLibs(libs)
    defaults.setEagerModelSync(true)
  }
  const created: monaco.editor.ITextModel[] = []
  for (const source of types.sources) {
    const uri = fileUri(projectId, source.path)
    if (monaco.editor.getModel(uri)) continue
    created.push(monaco.editor.createModel(source.text, languageFor(source.path), uri))
  }
  return created
}

/** Forget a project's types when its workspace closes. */
export function clearProjectTypes() {
  for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) defaults.setExtraLibs([])
}
