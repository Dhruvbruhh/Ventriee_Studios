# Code workspace and Source Control

Open a project, then choose **Code** in the top bar. The workspace adds a Monaco editor (the editing component used by VS Code) alongside Explorer, Source Control, and an optional live Preview.

## Editing

- Browse folders, create files/folders, and open multiple file tabs. Dependency folders, `.git`, and common generated folders are hidden.
- Ctrl/Cmd+P finds files by path; Ctrl/Cmd+S saves the current file; Ctrl/Cmd+Shift+S saves all open dirty files. Monaco provides find/replace, undo/redo, line numbers, selection, folding, a minimap, and its bundled language support. The status bar exposes language selection and cursor position.
- UTF-8 text files up to 2 MB are supported. BOM and line endings are preserved. Other encodings and binary files are rejected instead of being corrupted. Unsupported language grammars fall back to plain text; editing support does not imply every language has autocomplete, diagnostics, debugging, or a runtime. VS Code extensions are not automatically supported.
- Buffers remain open when switching between Plan, Code, and Office. Switching projects, closing dirty tabs, signing out, or closing the window asks before discarding edits. Save conflicts from agent/external edits require an explicit reload or preserving your edits elsewhere; there is no silent overwrite option.
- Clean active files reload from disk periodically. Dirty buffers are never automatically replaced by disk updates. New file/folder paths are relative to the project; parent folders must already exist. Symlink/junction editing and access to `.git` are refused.

## Search, panel, palette and terminals

- **Search** (sidebar, Ctrl/Cmd+Shift+F) finds text across project files and opens a result at its line. It reads up to 5,000 files, skips dependency/build folders, binary files and files over 2 MB, and stops at 500 hits.
- **Panel** (Ctrl/Cmd+`, or the status bar) has a **Terminal** and **Problems**. Problems lists Monaco's own diagnostics for open files (TypeScript/JavaScript, JSON, CSS, HTML). It is not a project-wide language server, so imports from `node_modules` show as unresolved.
- **Command palette** (Ctrl/Cmd+Shift+P) lists editor and view actions; arrow keys and Enter work.
- **Terminals**: the Code panel has one and the Office view has two on its left. Each is a real shell (PowerShell on Windows, `$SHELL` elsewhere, via `node-pty`) started in the project folder, with the owner's full permissions. Nothing sandboxes what you type. Shells keep running when you switch views, are private to the window that opened them (up to 8 per window), and are closed on sign-out, window close, project switch and quit.

## Ask agent

**Ask agent** (toolbar or palette) sends the selected code, or the whole open file if nothing is selected (up to 60,000 characters), and your question to the planner model set in Settings. **Ask** returns an answer. **Propose edit** returns a replacement shown as a diff; **Accept into editor** applies it as one undoable edit to the open buffer, and nothing reaches disk until you save. A proposal is refused if the file changed after you asked. Code you send goes to that provider.

## Agent changes

The **Agents** sidebar tab lists files each finished worker task changed or removed, recorded from its evidence check (tasks that ran before this version have none). In a Git repository a file opens as a diff against Git and can be restored from the last commit after confirmation. New files are never deleted from here. Without Git, files can only be opened.

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
