# Code workspace and Source Control

Open a project, then choose **Code** in the top bar. The workspace adds a Monaco editor (the editing component used by VS Code) alongside Explorer, Source Control, and an optional live Preview.

## Editing

- Browse folders, create files/folders, and open multiple file tabs. Dependency folders, `.git`, and common generated folders are hidden.
- Ctrl/Cmd+P finds files by path; Ctrl/Cmd+S saves the current file; Ctrl/Cmd+Shift+S saves all open dirty files. Monaco provides find/replace, undo/redo, line numbers, selection, folding, a minimap, and its bundled language support. The status bar exposes language selection and cursor position.
- UTF-8 text files up to 2 MB are supported. BOM and line endings are preserved. Other encodings and binary files are rejected instead of being corrupted. Unsupported language grammars fall back to plain text; editing support does not imply every language has autocomplete, diagnostics, debugging, or a runtime. VS Code extensions are not automatically supported.
- Buffers remain open when switching between Plan, Code, and Office. Switching projects, closing dirty tabs, signing out, or closing the window asks before discarding edits. Save conflicts from agent/external edits require an explicit reload or preserving your edits elsewhere; there is no silent overwrite option.
- Clean active files reload from disk periodically. Dirty buffers are never automatically replaced by disk updates. New file/folder paths are relative to the project; parent folders must already exist. Symlink/junction editing and access to `.git` are refused.

## Source Control

Requires Git on PATH and a project pointing at the repository root. Supports repository initialization, working/staged file lists, read-only side-by-side diffs, per-file stage/unstage, commits, recent history, local branch selection/creation, origin configuration, fetch, fast-forward-only pull, and push. First push sets an upstream on origin. Push and remote replacement ask for confirmation.

Commit identity and remote authentication come from your existing Git configuration. Configure GitHub SSH keys or Git Credential Manager outside the app. Interactive credential prompts are disabled so operations fail with a visible error rather than hanging. There is no force push, destructive reset, automatic stash, GitHub pull-request management, extension marketplace, or merge-conflict resolution wizard. Resolve conflicts in the editor and stage the resolved files. Detached/nested repositories and dirty branch switches surface explicit errors.

No project repository was staged, committed, or pushed during implementation. Integration tests use disposable repositories.

## Validation and outstanding checks

Latest pass (18 November 2026, Windows 11): `npm install` resolved `monaco-editor` 0.55.1 into the lockfile; main/preload and renderer typechecks pass; the production build bundles Monaco and its workers; all 147 tests pass with none skipped or excluded, including the real Git and loopback-network tests. Earlier passes also fixes prevent in-flight session restoration from undoing logout, avoid accessing destroyed window contents, warn about dirty buffers on project removal, and prevent late file/diff requests from stealing the selected view.

The local service tests check path restrictions, binary/size rejection, stale-save protection, file creation/search, and Supabase signin/session handling. Git porcelain parsing and initial UI rendering have dedicated tests. Real Git integration tests and atomic-replacement round-trips are retained, but are skipped only when this environment denies the required filesystem operations.

The Electron smoke run boots the built app to the sign-in screen with no console errors. In the dev app (`npm run dev`), a real Supabase signup, email confirmation and sign-in reached the studio; the Code workspace listed the project, opened a Markdown file in Monaco with highlighting and minimap, and the editor, JSON, CSS, HTML and TypeScript workers loaded with no errors. Monaco from the packaged custom origin, saving, Git writes and the remaining interactive checks below are still unverified. No missing package or UI flow was replaced with a simulated implementation.

Before release, verify on an unrestricted Windows session: signin/signup/email confirmation; open/edit/save/reopen; undo across tabs; unsaved tab/project/window prompts; external edit conflicts; Ctrl+P and Ctrl+S; language selection and workers; Explorer refresh; staged/unstaged/deleted/renamed files; clean and dirty branch switching; commit identity errors; authenticated fetch/pull/push; preview sizing at the supported minimum window width; and reauthentication with unsaved buffers. The whole UI cannot yet be certified as working.

Monaco reference: https://github.com/microsoft/monaco-editor
