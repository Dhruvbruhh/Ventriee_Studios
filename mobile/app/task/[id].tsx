import React, { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Button, Card, StateView, StatusChip, SectionTitle } from '@/components/ui'
import { useQuery } from '@/useQuery'
import { getTask, updateTaskStatus } from '@/cloud'
import { approvalDecisionStatus, isPendingApproval, TASK_STATUSES } from '@/status'
import { colors, space } from '@/theme'
import type { Task } from '@/types'


export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const taskQ = useQuery<Task | null>(() => getTask(id), [id])
  const task = taskQ.data ?? null
  const [busy, setBusy] = useState<string | null>(null)

  async function apply(status: string, verb: string) {
    setBusy(verb)
    try {
      await updateTaskStatus(id, status)
      await taskQ.refetch()
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.')
    } finally {
      setBusy(null)
    }
  }

  if (taskQ.loading || taskQ.error || !task) {
    return (
      <>
        <Stack.Screen options={{ title: 'Task' }} />
        <StateView
          loading={taskQ.loading}
          error={taskQ.error ?? (taskQ.loading ? null : 'That task is no longer available.')}
          onRetry={taskQ.refetch}
        />
      </>
    )
  }

  const pendingApproval = isPendingApproval(task.status)

  return (
    <>
      <Stack.Screen options={{ title: 'Task' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.title}>{task.title}</Text>
          <View style={{ marginTop: space.md }}><StatusChip status={task.status} /></View>
          <Text style={styles.meta}>Created {new Date(task.created_at).toLocaleString()}</Text>
        </Card>

        {pendingApproval ? (
          <View style={styles.section}>
            <SectionTitle>Approval</SectionTitle>
            <View style={styles.rowButtons}>
              <View style={styles.flex}>
                <Button title="Approve" onPress={() => apply(approvalDecisionStatus('approve'), 'approve')} loading={busy === 'approve'} />
              </View>
              <View style={styles.flex}>
                <Button title="Reject" variant="danger" onPress={() => apply(approvalDecisionStatus('reject'), 'reject')} loading={busy === 'reject'} />
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle>Set status</SectionTitle>
          {TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
            <View key={s} style={{ marginBottom: space.sm }}>
              <Button title={labelFor(s)} variant="ghost" onPress={() => apply(s, s)} loading={busy === s} />
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  )
}

function labelFor(status: string): string {
  return 'Mark ' + status.replace(/_/g, ' ')
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  meta: { color: colors.textDim, marginTop: space.md, fontSize: 13 },
  section: { gap: space.sm },
  rowButtons: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
})
