import React from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { Card, StateView } from '@/components/ui'
import { useWorkspace } from '@/workspace'
import { useQuery } from '@/useQuery'
import { listDevices } from '@/cloud'
import { isDeviceOnline } from '@/status'
import { colors, space } from '@/theme'
import type { Device } from '@/types'

export default function Devices() {
  const { workspace } = useWorkspace()
  const q = useQuery<Device[]>(() => listDevices(workspace), [workspace])
  const devices = q.data ?? []

  return (
    <FlatList
      data={devices}
      keyExtractor={(d) => d.id}
      refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.refetch} tintColor={colors.accent} />}
      ListHeaderComponent={<WorkspaceBar />}
      renderItem={({ item }) => {
        const online = isDeviceOnline(item.last_seen_at)
        return (
          <View style={styles.pad}>
            <Card>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>{item.platform || 'unknown platform'}</Text>
                </View>
                <View style={styles.statusWrap}>
                  <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.textDim }]} />
                  <Text style={[styles.status, { color: online ? colors.success : colors.textDim }]}>{online ? 'Online' : 'Offline'}</Text>
                </View>
              </View>
              <Text style={styles.seen}>Last seen {relative(item.last_seen_at)}</Text>
            </Card>
          </View>
        )
      }}
      ListEmptyComponent={
        q.loading || q.error
          ? <StateView loading={q.loading} error={q.error} onRetry={q.refetch} />
          : <StateView empty emptyText="No devices registered yet. Sign in on the desktop app to register one." />
      }
      contentContainerStyle={{ paddingVertical: space.md }}
    />
  )
}

function relative(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  if (!Number.isFinite(diff)) return 'unknown'
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  return `${Math.floor(hr / 24)} day(s) ago`
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.lg, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1, marginRight: space.md },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  statusWrap: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { fontSize: 13, fontWeight: '700' },
  seen: { color: colors.textDim, fontSize: 12, marginTop: space.sm },
})
