import React, { useMemo } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { Card, StateView, StatusChip, SectionTitle } from '@/components/ui'
import { useWorkspace } from '@/workspace'
import { useQuery } from '@/useQuery'
import { listProjects, listTasksForProjects } from '@/cloud'
import { isPendingApproval, taskStatusMeta } from '@/status'
import { colors, radius, space } from '@/theme'
import type { Project, Task } from '@/types'

export default function ProjectsOverview() {
  const { workspace, label } = useWorkspace()

  const projectsQ = useQuery<Project[]>(() => listProjects(workspace), [workspace])
  const projects = projectsQ.data ?? []
  const tasksQ = useQuery<Task[]>(
    () => listTasksForProjects(projects.map((p) => p.id)),
    [projects.map((p) => p.id).join(',')],
  )

  const approvals = useMemo(() => (tasksQ.data ?? []).filter((t) => isPendingApproval(t.status)), [tasksQ.data])
  const countsByProject = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tasksQ.data ?? []) m.set(t.project_id, (m.get(t.project_id) ?? 0) + 1)
    return m
  }, [tasksQ.data])

  const refreshing = projectsQ.loading || tasksQ.loading
  function refetch() { void projectsQ.refetch().then(() => tasksQ.refetch()) }

  return (
    <FlatList
      data={projects}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View>
          <WorkspaceBar />
          <View style={styles.pad}>
            <Text style={styles.heading}>{label}</Text>
            {approvals.length > 0 ? (
              <View style={styles.approvals}>
                <SectionTitle>Pending approvals · {approvals.length}</SectionTitle>
                {approvals.slice(0, 5).map((t) => (
                  <Link key={t.id} href={{ pathname: '/task/[id]', params: { id: t.id } }} asChild>
                    <Pressable>
                      <Card style={styles.approvalCard}>
                        <Text style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                        <StatusChip status={t.status} />
                      </Card>
                    </Pressable>
                  </Link>
                ))}
              </View>
            ) : null}
            <SectionTitle>Projects</SectionTitle>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/project/[id]', params: { id: item.id } }} asChild>
          <Pressable style={styles.pad}>
            <Card>
              <View style={styles.rowBetween}>
                <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                <StatusChip status={item.status} />
              </View>
              <Text style={styles.meta}>{countsByProject.get(item.id) ?? 0} task(s)</Text>
            </Card>
          </Pressable>
        </Link>
      )}
      ListEmptyComponent={
        projectsQ.loading || projectsQ.error ? (
          <StateView loading={projectsQ.loading} error={projectsQ.error} onRetry={refetch} />
        ) : (
          <StateView empty emptyText={`No projects in ${label} yet.`} />
        )
      }
      contentContainerStyle={{ paddingBottom: space.xl }}
    />
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.lg, marginBottom: space.md },
  heading: { color: colors.text, fontSize: 24, fontWeight: '800', marginVertical: space.md },
  approvals: { marginBottom: space.lg },
  approvalCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm, borderColor: colors.warning, borderRadius: radius.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  projectName: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  taskTitle: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, marginRight: space.sm },
  meta: { color: colors.textDim, marginTop: space.sm, fontSize: 13 },
})
