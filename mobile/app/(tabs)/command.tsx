import React, { useEffect, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { Button, Card, Chip, StateView, SectionTitle } from '@/components/ui'
import { useWorkspace } from '@/workspace'
import { useQuery } from '@/useQuery'
import { listDevices, listProjects, listCommands, enqueueCommand } from '@/cloud'
import { buildCommandRow, COMMAND_SPECS, describeCommand, type CommandType } from '@/commands'
import { commandStatusMeta } from '@/status'
import { colors, radius, space } from '@/theme'
import type { Command, Device, Project } from '@/types'

export default function CommandScreen() {
  const { workspace } = useWorkspace()
  const devicesQ = useQuery<Device[]>(() => listDevices(workspace), [workspace])
  const projectsQ = useQuery<Project[]>(() => listProjects(workspace), [workspace])

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [type, setType] = useState<CommandType>('ask_project_status')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Default to the first device once loaded.
  useEffect(() => {
    if (!deviceId && devicesQ.data?.length) setDeviceId(devicesQ.data[0].id)
  }, [devicesQ.data, deviceId])

  const spec = COMMAND_SPECS.find((s) => s.type === type)!
  const historyQ = useQuery<Command[]>(() => (deviceId ? listCommands(deviceId) : Promise.resolve([])), [deviceId])

  async function send() {
    setSending(true)
    try {
      const row = buildCommandRow({ type, deviceId: deviceId ?? '', orgId: workspace, projectId: spec.needsProject ? projectId : null })
      await enqueueCommand(row)
      await historyQ.refetch()
      Alert.alert('Sent', 'The desktop will pick up this command and report back here.')
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.')
    } finally {
      setSending(false)
    }
  }

  const canSend = Boolean(deviceId) && (!spec.needsProject || Boolean(projectId)) && !sending

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: space.xl }}
      refreshControl={<RefreshControl refreshing={historyQ.loading} onRefresh={historyQ.refetch} tintColor={colors.accent} />}
    >
      <WorkspaceBar />
      <View style={styles.body}>
        <SectionTitle>Device</SectionTitle>
        {devicesQ.loading || devicesQ.error ? (
          <StateView loading={devicesQ.loading} error={devicesQ.error} onRetry={devicesQ.refetch} />
        ) : devicesQ.data?.length ? (
          <PillGroup
            options={devicesQ.data.map((d) => ({ key: d.id, label: d.name }))}
            selected={deviceId}
            onSelect={setDeviceId}
          />
        ) : (
          <Text style={styles.hint}>No devices to command. Sign in on a desktop first.</Text>
        )}

        <View style={styles.gap} />
        <SectionTitle>Command</SectionTitle>
        <PillGroup
          options={COMMAND_SPECS.map((s) => ({ key: s.type, label: s.label }))}
          selected={type}
          onSelect={(k) => setType(k as CommandType)}
        />
        <Text style={styles.hint}>{spec.description}</Text>

        {spec.needsProject ? (
          <>
            <View style={styles.gap} />
            <SectionTitle>Project</SectionTitle>
            {projectsQ.data?.length ? (
              <PillGroup
                options={projectsQ.data.map((p) => ({ key: p.id, label: p.name }))}
                selected={projectId}
                onSelect={setProjectId}
              />
            ) : (
              <StateView loading={projectsQ.loading} error={projectsQ.error} empty={!projectsQ.loading && !projectsQ.error} emptyText="No projects in this workspace." onRetry={projectsQ.refetch} />
            )}
          </>
        ) : null}

        <View style={styles.gap} />
        <Button title="Send command" onPress={send} loading={sending} disabled={!canSend} />

        <View style={styles.gap} />
        <SectionTitle>Recent commands</SectionTitle>
        {historyQ.loading || historyQ.error ? (
          <StateView loading={historyQ.loading} error={historyQ.error} onRetry={historyQ.refetch} />
        ) : historyQ.data?.length ? (
          historyQ.data.map((c) => <CommandRow key={c.id} command={c} />)
        ) : (
          <StateView empty emptyText={deviceId ? 'No commands sent to this device yet.' : 'Pick a device to see its command history.'} />
        )}
      </View>
    </ScrollView>
  )
}

function CommandRow({ command }: { command: Command }) {
  const result = command.result ? JSON.stringify(command.result) : command.error
  return (
    <Card style={styles.cmdCard}>
      <View style={styles.cmdHead}>
        <Text style={styles.cmdTitle}>{describeCommand(command)}</Text>
        <Chip meta={commandStatusMeta(command.status)} />
      </View>
      {result ? <Text style={styles.cmdResult} numberOfLines={4}>{result}</Text> : null}
      <Text style={styles.cmdTime}>{new Date(command.created_at).toLocaleString()}</Text>
    </Card>
  )
}

function PillGroup({ options, selected, onSelect }: { options: { key: string; label: string }[]; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const active = o.key === selected
        return (
          <Pressable key={o.key} onPress={() => onSelect(o.key)} style={[styles.pill, active && styles.pillActive]}>
            <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg },
  gap: { height: space.lg },
  hint: { color: colors.textDim, fontSize: 13, marginTop: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.surface },
  pillActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  pillText: { color: colors.textDim, fontWeight: '600', maxWidth: 220 },
  pillTextActive: { color: colors.text },
  cmdCard: { marginBottom: space.sm },
  cmdHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  cmdTitle: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  cmdResult: { color: colors.textDim, fontSize: 13, marginTop: space.sm, fontFamily: 'monospace' },
  cmdTime: { color: colors.textDim, fontSize: 12, marginTop: space.sm },
})
