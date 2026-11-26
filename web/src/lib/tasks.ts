// Task status + priority model and the transition rules the board enforces.
// Pure logic, unit-tested; the UI and RLS both rely on these being correct.
import type { Task } from './types'

export type TaskStatus =
  | 'backlog' | 'todo' | 'in_progress' | 'waiting'
  | 'blocked' | 'in_review' | 'completed' | 'cancelled'

/** Board column order, left to right. */
export const TASK_STATUSES: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'waiting', 'blocked', 'in_review', 'completed', 'cancelled',
]

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  in_review: 'In review',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
}
/** Higher sorts first. */
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 3, high: 2, medium: 1, low: 0 }

const TERMINAL: TaskStatus[] = ['completed', 'cancelled']

/** Allowed next statuses from each status. Any non-terminal can be cancelled. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'in_progress', 'cancelled'],
  todo: ['backlog', 'in_progress', 'cancelled'],
  in_progress: ['todo', 'waiting', 'blocked', 'in_review', 'cancelled'],
  waiting: ['in_progress', 'blocked', 'cancelled'],
  blocked: ['in_progress', 'waiting', 'cancelled'],
  in_review: ['in_progress', 'completed', 'cancelled'],
  completed: ['in_progress'],   // reopen
  cancelled: ['backlog'],       // reopen
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as string[]).includes(value)
}

export function isTerminal(status: string): boolean {
  return isTaskStatus(status) && TERMINAL.includes(status)
}

/** Open = not completed/cancelled. Unknown statuses are treated as open. */
export function isOpen(status: string): boolean {
  return !isTerminal(status)
}

/** Can a task move from `from` to `to`? Same-status and unknowns are rejected. */
export function canTransition(from: string, to: string): boolean {
  if (!isTaskStatus(from) || !isTaskStatus(to) || from === to) return false
  return TRANSITIONS[from].includes(to)
}

/** Statuses a task may move to from its current one. */
export function nextStatuses(from: string): TaskStatus[] {
  return isTaskStatus(from) ? TRANSITIONS[from] : []
}

/** Overdue = has a deadline in the past and is still open. `now` is injectable. */
export function isOverdue(task: Pick<Task, 'deadline' | 'status'>, now: Date = new Date()): boolean {
  if (!task.deadline || !isOpen(task.status)) return false
  const due = new Date(task.deadline)
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()
}

export function priorityRank(priority: string): number {
  return priority in PRIORITY_RANK ? PRIORITY_RANK[priority as TaskPriority] : -1
}

/** Sort tasks by priority (high first), then nearest deadline, then newest. */
export function compareTasks(a: Task, b: Task): number {
  const p = priorityRank(b.priority) - priorityRank(a.priority)
  if (p !== 0) return p
  const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity
  const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity
  if (ad !== bd) return ad - bd
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}
