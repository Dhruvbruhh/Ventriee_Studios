import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type VentrieeApi, type CredentialInfo } from '../shared/ipc'
import type { ChatMessage, EngineKind, ModelOption, ModelPrefs, PromptDoc, ProviderConfig, Snapshot } from '../shared/types'

const api: VentrieeApi = {
  filesList: (id, path) => ipcRenderer.invoke(IPC.filesList, id, path),
  filesFind: (id, query) => ipcRenderer.invoke(IPC.filesFind, id, query),
  filesSearch: (id, query, caseSensitive) => ipcRenderer.invoke(IPC.filesSearch, id, query, caseSensitive),
  projectTypes: (id) => ipcRenderer.invoke(IPC.projectTypes, id),
  codeAsk: (id, input) => ipcRenderer.invoke(IPC.codeAsk, id, input),
  codeChange: (id, input) => ipcRenderer.invoke(IPC.codeChange, id, input),
  codeComplete: (id, input) => ipcRenderer.invoke(IPC.codeComplete, id, input),
  runsList: (id) => ipcRenderer.invoke(IPC.runsList, id),
  runChanges: (id, jobId) => ipcRenderer.invoke(IPC.runChanges, id, jobId),
  runUndo: (id, jobId) => ipcRenderer.invoke(IPC.runUndo, id, jobId),
  updateState: () => ipcRenderer.invoke(IPC.updateState),
  updateCheck: () => ipcRenderer.invoke(IPC.updateCheck),
  updateInstall: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdate: (cb) => {
    const listener = (_e: unknown, state: Parameters<typeof cb>[0]) => cb(state)
    ipcRenderer.on(IPC.updateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.updateChanged, listener)
  },
  filesRead: (id, path) => ipcRenderer.invoke(IPC.filesRead, id, path),
  filesSave: (id, file) => ipcRenderer.invoke(IPC.filesSave, id, file),
  filesCreate: (id, path, directory) => ipcRenderer.invoke(IPC.filesCreate, id, path, directory),
  filesRename: (id, from, to) => ipcRenderer.invoke(IPC.filesRename, id, from, to),
  filesTrash: (id, path) => ipcRenderer.invoke(IPC.filesTrash, id, path),
  gitStatus: (id) => ipcRenderer.invoke(IPC.gitStatus, id),
  gitDiff: (id, path, staged) => ipcRenderer.invoke(IPC.gitDiff, id, path, staged),
  gitAction: (id, action, path, value) => ipcRenderer.invoke(IPC.gitAction, id, action, path, value),
  gitLineChanges: (id, path) => ipcRenderer.invoke(IPC.gitLineChanges, id, path),
  gitBlame: (id, path, line) => ipcRenderer.invoke(IPC.gitBlame, id, path, line),
  termOpen: (id, cols, rows) => ipcRenderer.invoke(IPC.termOpen, id, cols, rows),
  termWrite: (id, data) => ipcRenderer.invoke(IPC.termWrite, id, data),
  termResize: (id, cols, rows) => ipcRenderer.invoke(IPC.termResize, id, cols, rows),
  termClose: (id) => ipcRenderer.invoke(IPC.termClose, id),
  onTermData: (cb) => {
    const listener = (_e: unknown, payload: { id: string; data: string }) => cb(payload)
    ipcRenderer.on(IPC.termData, listener)
    return () => ipcRenderer.removeListener(IPC.termData, listener)
  },
  debugStart: (id, file, breakpoints) => ipcRenderer.invoke(IPC.debugStart, id, file, breakpoints),
  debugCommand: (action) => ipcRenderer.invoke(IPC.debugCommand, action),
  debugEvaluate: (expression) => ipcRenderer.invoke(IPC.debugEvaluate, expression),
  debugBreakpoints: (path, lines) => ipcRenderer.invoke(IPC.debugBreakpoints, path, lines),
  debugStop: () => ipcRenderer.invoke(IPC.debugStop),
  onDebug: (cb) => {
    const listener = (_e: unknown, event: Parameters<typeof cb>[0]) => cb(event)
    ipcRenderer.on(IPC.debugEvent, listener)
    return () => ipcRenderer.removeListener(IPC.debugEvent, listener)
  },
  onTermExit: (cb) => {
    const listener = (_e: unknown, payload: { id: string; code: number }) => cb(payload)
    ipcRenderer.on(IPC.termExit, listener)
    return () => ipcRenderer.removeListener(IPC.termExit, listener)
  },
  authStatus: () => ipcRenderer.invoke(IPC.authStatus),
  authSignIn: (input, signup) => ipcRenderer.invoke(IPC.authSignIn, input, signup),
  authClear: () => ipcRenderer.invoke(IPC.authClear),
  onAuthLocked: (cb) => {
    const listener = () => cb()
    ipcRenderer.on(IPC.authLocked, listener)
    return () => ipcRenderer.removeListener(IPC.authLocked, listener)
  },
  snapshot: () => ipcRenderer.invoke(IPC.snapshot),
  onPatch: (cb) => {
    const listener = (_e: unknown, patch: Snapshot) => cb(patch)
    ipcRenderer.on(IPC.patch, listener)
    return () => ipcRenderer.removeListener(IPC.patch, listener)
  },
  onOutput: (cb) => {
    const listener = (_e: unknown, payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => cb(payload)
    ipcRenderer.on(IPC.output, listener)
    return () => ipcRenderer.removeListener(IPC.output, listener)
  },
  testEngine: (engine, model, endpoint) => ipcRenderer.invoke(IPC.testEngine, engine, model, endpoint),
  createProject: (input) => ipcRenderer.invoke(IPC.createProject, input),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  selectProject: (id) => ipcRenderer.invoke(IPC.selectProject, id),
  openProjectWindow: (projectId) => ipcRenderer.invoke(IPC.openProjectWindow, projectId),
  updateProject: (id, patch) => ipcRenderer.invoke(IPC.updateProject, id, patch),
  deleteProject: (id) => ipcRenderer.invoke(IPC.deleteProject, id),
  createAgent: (input) => ipcRenderer.invoke(IPC.createAgent, input),
  updateAgent: (id, patch) => ipcRenderer.invoke(IPC.updateAgent, id, patch),
  deleteAgent: (id) => ipcRenderer.invoke(IPC.deleteAgent, id),
  duplicateAgent: (id) => ipcRenderer.invoke(IPC.duplicateAgent, id),
  startRun: (input) => ipcRenderer.invoke(IPC.startRun, input),
  stopRun: (projectId) => ipcRenderer.invoke(IPC.stopRun, projectId),
  approveTask: (taskId) => ipcRenderer.invoke(IPC.approveTask, taskId),
  rejectTask: (taskId, reason) => ipcRenderer.invoke(IPC.rejectTask, taskId, reason),
  retryTask: (taskId) => ipcRenderer.invoke(IPC.retryTask, taskId),
  deleteTask: (taskId) => ipcRenderer.invoke(IPC.deleteTask, taskId),
  stopAgent: (agentId) => ipcRenderer.invoke(IPC.stopAgent, agentId),
  pauseAgent: (agentId) => ipcRenderer.invoke(IPC.pauseAgent, agentId),
  resumeAgent: (agentId) => ipcRenderer.invoke(IPC.resumeAgent, agentId),
  instructAgent: (agentId, text) => ipcRenderer.invoke(IPC.instructAgent, agentId, text),
  saveMemory: (input) => ipcRenderer.invoke(IPC.saveMemory, input),
  deleteMemory: (id) => ipcRenderer.invoke(IPC.deleteMemory, id),
  pinMemory: (id) => ipcRenderer.invoke(IPC.pinMemory, id),
  searchMemory: (query) => ipcRenderer.invoke(IPC.searchMemory, query),
  importSkill: () => ipcRenderer.invoke(IPC.importSkill),
  toggleSkill: (id) => ipcRenderer.invoke(IPC.toggleSkill, id),
  refreshSkills: () => ipcRenderer.invoke(IPC.refreshSkills),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  saveCredential: (engine: EngineKind, value: string) => ipcRenderer.invoke(IPC.saveCredential, engine, value),
  clearCredential: (engine: EngineKind) => ipcRenderer.invoke(IPC.clearCredential, engine),
  credentials: (): Promise<CredentialInfo[]> => ipcRenderer.invoke(IPC.credentials),
  addAutomation: (input) => ipcRenderer.invoke(IPC.addAutomation, input),
  toggleAutomation: (id) => ipcRenderer.invoke(IPC.toggleAutomation, id),
  deleteAutomation: (id) => ipcRenderer.invoke(IPC.deleteAutomation, id),
  previewStart: (projectId) => ipcRenderer.invoke(IPC.previewStart, projectId),
  previewInstall: (projectId) => ipcRenderer.invoke(IPC.previewInstall, projectId),
  previewStop: (projectId) => ipcRenderer.invoke(IPC.previewStop, projectId),
  previewRefresh: (projectId) => ipcRenderer.invoke(IPC.previewRefresh, projectId),
  previewArtifact: (projectId, path) => ipcRenderer.invoke(IPC.previewArtifact, projectId, path),
  previewApiRequest: (input) => ipcRenderer.invoke(IPC.previewApiRequest, input),
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  revealFile: (path) => ipcRenderer.invoke(IPC.revealFile, path),
  chatSend: (input) => ipcRenderer.invoke(IPC.chatSend, input),
  chatSessionNew: (projectId) => ipcRenderer.invoke(IPC.chatSessionNew, projectId),
  chatSessionSelect: (projectId, conversationId) => ipcRenderer.invoke(IPC.chatSessionSelect, projectId, conversationId),
  onChatChunk: (cb) => {
    const listener = (_e: unknown, payload: { projectId: string; messageId: string; chunk: string }) => cb(payload)
    ipcRenderer.on(IPC.chatChunk, listener)
    return () => ipcRenderer.removeListener(IPC.chatChunk, listener)
  },
  promptCreate: (input) => ipcRenderer.invoke(IPC.promptCreate, input),
  promptEnhance: (input) => ipcRenderer.invoke(IPC.promptEnhance, input),
  promptSave: (input) => ipcRenderer.invoke(IPC.promptSave, input),
  assignPrompt: (input) => ipcRenderer.invoke(IPC.assignPrompt, input),
  chatAdvisor: (input) => ipcRenderer.invoke(IPC.chatAdvisor, input),
  modelsDiscover: (projectId) => ipcRenderer.invoke(IPC.modelsDiscover, projectId),
  saveModelPrefs: (patch) => ipcRenderer.invoke(IPC.modelPrefs, patch),
  addProvider: (input) => ipcRenderer.invoke(IPC.addProvider, input),
  updateProvider: (id, patch) => ipcRenderer.invoke(IPC.updateProvider, id, patch),
  deleteProvider: (id) => ipcRenderer.invoke(IPC.deleteProvider, id),
  testProvider: (input) => ipcRenderer.invoke(IPC.testProvider, input)
}

contextBridge.exposeInMainWorld('ventriee', api)
