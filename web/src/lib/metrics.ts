// Pure derivations for the overview and workload views. Kept separate from the
// components so the counting rules are testable and unambiguous.
import type { Project, Task, TaskAssignment } from './types'
import { isOpen, isOverdue, isTerminal } from './tasks'

export interface Overview {
  activeProjects: number
  completedProjects: number
  pendingTasks: number
  overdueTasks: number
}

export function deriveOverview(projects: Project[], tasks: Task[], now: Date = new Date()): Overview {
  return {
    activeProjects: projects.filter((p) => p.status === 'active').length,
    completedProjects: projects.filter((p) => p.status === 'completed').length,
    pendingTasks: tasks.filter((t) => isOpen(t.status)).length,
    overdueTasks: tasks.filter((t) => isOverdue(t, now)).length,
  }
}

export interface Workload {
  userId: string
  open: number
  overdue: number
  completed: number
}

/** Open/overdue/completed task counts per assigned user, busiest first. */
export function deriveWorkload(tasks: Task[], assignments: TaskAssignment[], now: Date = new Date()): Workload[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const acc = new Map<string, Workload>()
  for (const a of assignments) {
    const task = byId.get(a.task_id)
    if (!task) continue
    const w = acc.get(a.user_id) ?? { userId: a.user_id, open: 0, overdue: 0, completed: 0 }
    if (isTerminal(task.status)) {
      if (task.status === 'completed') w.completed += 1
    } else {
      w.open += 1
      if (isOverdue(task, now)) w.overdue += 1
    }
    acc.set(a.user_id, w)
  }
  return [...acc.values()].sort((a, b) => b.open - a.open || b.overdue - a.overdue)
}
