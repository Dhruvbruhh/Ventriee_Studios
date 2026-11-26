import React from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { Card, StateView, StatusChip } from '@/components/ui'
import { useQuery } from '@/useQuery'
import { listTasks } from '@/cloud'
import { colors, space } from '@/theme'
import type { Task } from '@/types'

export default function ProjectTasks() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const tasksQ = useQuery<Task[]>(() => listTasks(id), [id])
  const tasks = tasksQ.data ?? []

  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Project' }} />
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={tasksQ.loading} onRefresh={tasksQ.refetch} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/task/[id]', params: { id: item.id } }} asChild>
            <Pressable style={styles.pad}>
              <Card>
                <View style={styles.row}>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <StatusChip status={item.status} />
                </View>
              </Card>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          tasksQ.loading || tasksQ.error
            ? <StateView loading={tasksQ.loading} error={tasksQ.error} onRetry={tasksQ.refetch} />
            : <StateView empty emptyText="No tasks in this project yet." />
        }
        contentContainerStyle={{ paddingVertical: space.md }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.lg, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
})
