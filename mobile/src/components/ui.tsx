// Small shared UI kit so every screen gets the same loading / empty / error states
// and the app reads as one assistant surface. Kept deliberately minimal.
import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors, radius, space, toneColor } from '../theme'
import { taskStatusMeta, type StatusMeta } from '../status'

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Chip({ meta }: { meta: StatusMeta }) {
  const color = toneColor(meta.tone)
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.chipText, { color }]}>{meta.label}</Text>
    </View>
  )
}

export function StatusChip({ status }: { status: string }) {
  return <Chip meta={taskStatusMeta(status)} />
}

export function Button(
  { title, onPress, variant = 'primary', disabled, loading }:
  { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean },
) {
  const tint = variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.accent : colors.accent
  const bg = variant === 'primary' ? colors.accent : 'transparent'
  const fg = variant === 'primary' ? '#06111f' : tint
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: tint, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  )
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textDim} style={styles.field} {...props} />
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

/** Centered loading / error / empty placeholder. */
export function StateView(
  { loading, error, empty, emptyText, onRetry }:
  { loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string; onRetry?: () => void },
) {
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.accent} /><Text style={styles.stateText}>Loading…</Text></View>
  if (error) return (
    <View style={styles.state}>
      <Text style={[styles.stateText, { color: colors.danger }]}>{error}</Text>
      {onRetry ? <View style={{ marginTop: space.md }}><Button title="Try again" variant="ghost" onPress={onRetry} /></View> : null}
    </View>
  )
  if (empty) return <View style={styles.state}><Text style={styles.stateText}>{emptyText ?? 'Nothing here yet.'}</Text></View>
  return null
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  button: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonText: { fontSize: 15, fontWeight: '700' },
  field: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, paddingHorizontal: space.md, paddingVertical: space.md, fontSize: 16 },
  sectionTitle: { color: colors.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space.sm },
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl * 2 },
  stateText: { color: colors.textDim, fontSize: 15, marginTop: space.sm, textAlign: 'center', paddingHorizontal: space.xl },
})
