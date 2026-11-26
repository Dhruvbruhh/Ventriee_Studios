import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type VentrieeApi, type CredentialInfo } from '../shared/ipc'
import type { ChatMessage, EngineKind, ModelOption, ModelPrefs, PromptDoc, ProviderConfig, Snapshot } from '../shared/types'

const api: VentrieeApi = {
  filesList: (id, path) => ipcRenderer.invoke(IPC.filesList, id, path),
  filesFind: (id, query) => ipcRenderer.invoke(IPC.filesFind, id, query),
  filesSearch: (id, query, caseSensitive) => ipcRenderer.invoke(IPC.filesSearch, id, query, caseSensitive),
  projectTypes: (id) => ipcRenderer.invoke(IPC.projectTypes, id),
  toolsFormat: (id, path, text) => ipcRenderer.invoke(IPC.toolsFormat, id, path, text),
  editorConfig: (id, path) => ipcRenderer.invoke(IPC.editorConfig, id, path),
  toolsLint: (id, path, text) => ipcRenderer.invoke(IPC.toolsLint, id, path, text),
  codeAsk: (id, input) => ipcRenderer.invoke(IPC.codeAsk, id, input),
  codeChange: (id, input) => ipcRenderer.invoke(IPC.codeChange, id, input),
  codeComplete: (id, input) => ipcRenderer.invoke(IPC.codeComplete, id, input),
  runsList: (id) => ipcRenderer.invoke(IPC.runsList, id),
  spendToday: (id) => ipcRenderer.invoke(IPC.spendToday, id),
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
  termOpen: (id, cols, rows, shell) => ipcRenderer.invoke(IPC.termOpen, id, cols, rows, shell),
  termShells: () => ipcRenderer.invoke(IPC.termShells),
  termWrite: (id, data) => ipcRenderer.invoke(IPC.termWrite, id, data),
  termResize: (id, cols, rows) => ipcRenderer.invoke(IPC.termResize, id, cols, rows),
  termClose: (id) => ipcRenderer.invoke(IPC.termClose, id),
  onTermData: (cb) => {
    const listener = (_e: unknown, payload: { id: string; data: string }) => cb(payload)
    ipcRenderer.on(IPC.termData, listener)
    return () => ipcRenderer.removeListener(IPC.termData, listener)
  },
  debugConfigs: (id) => ipcRenderer.invoke(IPC.debugConfigs, id),
  debugStart: (id, input, breakpoints) => ipcRenderer.invoke(IPC.debugStart, id, input, breakpoints),
  debugVariables: (ref) => ipcRenderer.invoke(IPC.debugVariables, ref),
  debugThread: (threadId) => ipcRenderer.invoke(IPC.debugThread, threadId),
  debugCommand: (action) => ipcRenderer.invoke(IPC.debugCommand, action),
  debugEvaluate: (expression) => ipcRenderer.invoke(IPC.debugEvaluate, expression),
  debugBreakpoints: (path, list) => ipcRenderer.invoke(IPC.debugBreakpoints, path, list),
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
  extSearch: (query) => ipcRenderer.invoke(IPC.extSearch, query),
  extDetails: (id) => ipcRenderer.invoke(IPC.extDetails, id),
  extInstall: (id) => ipcRenderer.invoke(IPC.extInstall, id),
  extUninstall: (id) => ipcRenderer.invoke(IPC.extUninstall, id),
  extSetEnabled: (id, enabled) => ipcRenderer.invoke(IPC.extSetEnabled, id, enabled),
  extList: () => ipcRenderer.invoke(IPC.extList),
  extUpdates: () => ipcRenderer.invoke(IPC.extUpdates),
  extContributions: () => ipcRenderer.invoke(IPC.extContributions),
  extIconTheme: (id) => ipcRenderer.invoke(IPC.extIconTheme, id),
  testsRunners: (id) => ipcRenderer.invoke(IPC.testsRunners, id),
  testsRun: (id, runnerId, target) => ipcRenderer.invoke(IPC.testsRun, id, runnerId, target),
  testsStop: () => ipcRenderer.invoke(IPC.testsStop),
  onTests: (cb) => {
    const listener = (_e: unknown, event: Parameters<typeof cb>[0]) => cb(event)
    ipcRenderer.on(IPC.testsEvent, listener)
    return () => ipcRenderer.removeListener(IPC.testsEvent, listener)
  },
  tasksList: (id) => ipcRenderer.invoke(IPC.tasksList, id),
  filesReadLarge: (id, path) => ipcRenderer.invoke(IPC.filesReadLarge, id, path),
  toolsDetect: () => ipcRenderer.invoke(IPC.toolsDetect),
  errorReport: (message, stack) => ipcRenderer.invoke(IPC.errorReport, message, stack),
  errorLog: () => ipcRenderer.invoke(IPC.errorLog),
  errorClear: () => ipcRenderer.invoke(IPC.errorClear),
  reportProblem: () => ipcRenderer.invoke(IPC.reportProblem),
  syncPush: () => ipcRenderer.invoke(IPC.syncPush),
  syncPull: () => ipcRenderer.invoke(IPC.syncPull),
  github: (id, action) => ipcRenderer.invoke(IPC.github, id, action),
  githubReview: (id, number) => ipcRenderer.invoke(IPC.githubReview, id, number),
  historyList: (id, path) => ipcRenderer.invoke(IPC.historyList, id, path),
  historyRead: (id, path, version) => ipcRenderer.invoke(IPC.historyRead, id, path, version),
  toolCatalog: () => ipcRenderer.invoke(IPC.toolCatalog),
  lspEnsure: (id, language) => ipcRenderer.invoke(IPC.lspEnsure, id, language),
  lspRequest: (id, language, method, params) => ipcRenderer.invoke(IPC.lspRequest, id, language, method, params),
  lspNotify: (id, language, method, params) => ipcRenderer.invoke(IPC.lspNotify, id, language, method, params),
  notebookStart: (id, path) => ipcRenderer.invoke(IPC.notebookStart, id, path),
  notebookExecute: (id, path, cell, code) => ipcRenderer.invoke(IPC.notebookExecute, id, path, cell, code),
  notebookInterrupt: (id, path) => ipcRenderer.invoke(IPC.notebookInterrupt, id, path),
  notebookRestart: (id, path) => ipcRenderer.invoke(IPC.notebookRestart, id, path),
  notebookShutdown: (id, path) => ipcRenderer.invoke(IPC.notebookShutdown, id, path),
  onNotebook: (cb) => {
    const listener = (_e: unknown, event: Parameters<typeof cb>[0]) => cb(event)
    ipcRenderer.on(IPC.notebookEvent, listener)
    return () => ipcRenderer.removeListener(IPC.notebookEvent, listener)
  },
  onLsp: (cb) => {
    const listener = (_e: unknown, event: Parameters<typeof cb>[0]) => cb(event)
    ipcRenderer.on(IPC.lspEvent, listener)
    return () => ipcRenderer.removeListener(IPC.lspEvent, listener)
  },
  authStatus: () => ipcRenderer.invoke(IPC.authStatus),
  authSignIn: (input, signup) => ipcRenderer.invoke(IPC.authSignIn, input, signup),
  authClear: () => ipcRenderer.invoke(IPC.authClear),
  authRecover: (email) => ipcRenderer.invoke(IPC.authRecover, email),
  authReset: (input) => ipcRenderer.invoke(IPC.authReset, input),
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
  attachmentSave: (id, name, data) => ipcRenderer.invoke(IPC.attachmentSave, id, name, data),
  screenshots: (id) => ipcRenderer.invoke(IPC.screenshots, id),
  transcribe: (audio) => ipcRenderer.invoke(IPC.transcribe, audio),
  modelsDiscover: (projectId) => ipcRenderer.invoke(IPC.modelsDiscover, projectId),
  saveModelPrefs: (patch) => ipcRenderer.invoke(IPC.modelPrefs, patch),
  addProvider: (input) => ipcRenderer.invoke(IPC.addProvider, input),
  updateProvider: (id, patch) => ipcRenderer.invoke(IPC.updateProvider, id, patch),
  deleteProvider: (id) => ipcRenderer.invoke(IPC.deleteProvider, id),
  testProvider: (input) => ipcRenderer.invoke(IPC.testProvider, input),
  graphifyStatus: (id) => ipcRenderer.invoke(IPC.graphifyStatus, id),
  graphifyBuild: (id) => ipcRenderer.invoke(IPC.graphifyBuild, id),
  graphifyQuery: (id, question) => ipcRenderer.invoke(IPC.graphifyQuery, id, question),
  clientList: () => ipcRenderer.invoke(IPC.clientList),
  clientCreate: (input) => ipcRenderer.invoke(IPC.clientCreate, input),
  clientUpdate: (id, patch) => ipcRenderer.invoke(IPC.clientUpdate, id, patch),
  clientDelete: (id) => ipcRenderer.invoke(IPC.clientDelete, id),
  analyticsOverview: (sinceMs) => ipcRenderer.invoke(IPC.analyticsOverview, sinceMs),
  voiceAsk: (input) => ipcRenderer.invoke(IPC.voiceAsk, input),
  onVoiceChunk: (cb) => {
    const listener = (_e: unknown, payload: { requestId: string; chunk: string }) => cb(payload)
    ipcRenderer.on(IPC.voiceChunk, listener)
    return () => ipcRenderer.removeListener(IPC.voiceChunk, listener)
  },
  voiceCancel: (requestId) => ipcRenderer.invoke(IPC.voiceCancel, requestId),
  voiceTranscribe: (audio) => ipcRenderer.invoke(IPC.voiceTranscribe, audio),
  voiceSpeak: (text) => ipcRenderer.invoke(IPC.voiceSpeak, text),
  mcpInspect: (name) => ipcRenderer.invoke(IPC.mcpInspect, name),
  workflowList: () => ipcRenderer.invoke(IPC.workflowList),
  workflowSave: (input) => ipcRenderer.invoke(IPC.workflowSave, input),
  workflowDelete: (id) => ipcRenderer.invoke(IPC.workflowDelete, id),
  workflowRun: (id) => ipcRenderer.invoke(IPC.workflowRun, id),
  workflowStop: (id) => ipcRenderer.invoke(IPC.workflowStop, id),
  workflowVersions: (id) => ipcRenderer.invoke(IPC.workflowVersions, id),
  workflowRestore: (id, versionId) => ipcRenderer.invoke(IPC.workflowRestore, id, versionId),
  workflowApprove: (runId, nodeId, approved) => ipcRenderer.invoke(IPC.workflowApprove, runId, nodeId, approved),
  skillRead: (id) => ipcRenderer.invoke(IPC.skillRead, id),
  skillWrite: (id, content) => ipcRenderer.invoke(IPC.skillWrite, id, content),
  skillInstallUrl: (url) => ipcRenderer.invoke(IPC.skillInstallUrl, url),
  mcpToolCalls: (sessionId) => ipcRenderer.invoke(IPC.mcpToolCalls, sessionId),
  onWorkflowEvent: (cb) => {
    const listener = (_e: unknown, event: Parameters<typeof cb>[0]) => cb(event)
    ipcRenderer.on(IPC.workflowEvent, listener)
    return () => ipcRenderer.removeListener(IPC.workflowEvent, listener)
  },
  browserRun: (script) => ipcRenderer.invoke(IPC.browserRun, script),
  browserLogs: () => ipcRenderer.invoke(IPC.browserLogs),
  browserClose: () => ipcRenderer.invoke(IPC.browserClose),
  githubAuth: () => ipcRenderer.invoke(IPC.githubAuth),
  pluginList: () => ipcRenderer.invoke(IPC.pluginList),
  pluginPreview: (source) => ipcRenderer.invoke(IPC.pluginPreview, source),
  pluginInstall: (token) => ipcRenderer.invoke(IPC.pluginInstall, token),
  pluginDiscard: (token) => ipcRenderer.invoke(IPC.pluginDiscard, token),
  pluginRemove: (id) => ipcRenderer.invoke(IPC.pluginRemove, id),
  resources: (projectId) => ipcRenderer.invoke(IPC.resources, projectId),
  securityScan: (projectId) => ipcRenderer.invoke(IPC.securityScan, projectId),
  agentCatalogue: () => ipcRenderer.invoke(IPC.agentCatalogue),
  agentTemplateSave: (template, create) => ipcRenderer.invoke(IPC.agentTemplateSave, template, create),
  agentTemplateDelete: (role) => ipcRenderer.invoke(IPC.agentTemplateDelete, role),
  agentDepartmentsSave: (departments) => ipcRenderer.invoke(IPC.agentDepartmentsSave, departments),
  agentExport: (pick) => ipcRenderer.invoke(IPC.agentExport, pick),
  agentImport: () => ipcRenderer.invoke(IPC.agentImport),
  remoteList: () => ipcRenderer.invoke(IPC.remoteList),
  remoteTest: (host) => ipcRenderer.invoke(IPC.remoteTest, host),
  remoteStart: (input) => ipcRenderer.invoke(IPC.remoteStart, input),
  remoteRefresh: (id) => ipcRenderer.invoke(IPC.remoteRefresh, id),
  remoteCancel: (id) => ipcRenderer.invoke(IPC.remoteCancel, id),
  remotePatch: (id) => ipcRenderer.invoke(IPC.remotePatch, id),
  remoteCleanup: (id) => ipcRenderer.invoke(IPC.remoteCleanup, id),
  remoteForget: (id) => ipcRenderer.invoke(IPC.remoteForget, id),
  mcpSearch: (query, cursor) => ipcRenderer.invoke(IPC.mcpSearch, query, cursor),
  mcpInstall: (server, option, values) => ipcRenderer.invoke(IPC.mcpInstall, server, option, values),
  onBrowserEvent: (cb) => {
    const listener = (_e: unknown, r: Parameters<typeof cb>[0]) => cb(r)
    ipcRenderer.on(IPC.browserEvent, listener)
    return () => ipcRenderer.removeListener(IPC.browserEvent, listener)
  },
  cloudOrgs: () => ipcRenderer.invoke(IPC.cloudOrgs),
  cloudSetWorkspace: (orgId) => ipcRenderer.invoke(IPC.cloudWorkspace, orgId),
  remoteStatus: () => ipcRenderer.invoke(IPC.remoteStatus),
  remoteSetEnabled: (on) => ipcRenderer.invoke(IPC.remoteSetEnabled, on)
}

contextBridge.exposeInMainWorld('ventriee', api)
