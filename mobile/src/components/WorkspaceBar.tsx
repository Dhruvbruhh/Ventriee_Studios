// Horizontal pill switcher for the active workspace (Personal + each org the user
// belongs to). Switching re-scopes every screen's queries.
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useWorkspace } from '../workspace'
import { colors, radius, space } from '../theme'
import type { Workspace } from '../cloud'

export function WorkspaceBar() {
  const { workspace, orgs, setWorkspace } = useWorkspace()
  const options: { key: string; label: string; value: Workspace }[] = [
    { key: 'personal', label: 'Personal', value: null },
    ...orgs.map((o) => ({ key: o.id, label: o.name, value: o.id as Workspace })),
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((opt) => {
        const active = opt.value === workspace
        return (
          <Pressable key={opt.key} onPress={() => setWorkspace(opt.value)} style={[styles.pill, active && styles.pillActive]}>
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>{opt.label}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.surface },
  pillActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  text: { color: colors.textDim, fontWeight: '600', maxWidth: 160 },
  textActive: { color: colors.text },
})
