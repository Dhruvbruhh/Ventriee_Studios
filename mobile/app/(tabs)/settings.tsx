import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { Button, Card, SectionTitle } from '@/components/ui'
import { useAuth } from '@/auth'
import { useWorkspace } from '@/workspace'
import { registerForPushNotifications } from '@/notifications'
import { colors, space } from '@/theme'

export default function Settings() {
  const { email, signOut } = useAuth()
  const { label } = useWorkspace()
  const [pushState, setPushState] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enablePush() {
    setBusy(true)
    try {
      const { token, reason } = await registerForPushNotifications()
      setPushState(token ? 'Registered for push notifications.' : (reason ?? 'Not available.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
      <WorkspaceBar />
      <View style={styles.body}>
        <SectionTitle>Account</SectionTitle>
        <Card>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{email ?? 'unknown'}</Text>
          <Text style={[styles.label, { marginTop: space.md }]}>Active workspace</Text>
          <Text style={styles.value}>{label}</Text>
        </Card>

        <View style={styles.gap} />
        <SectionTitle>Notifications</SectionTitle>
        <Card>
          <Text style={styles.body2}>Get a push when a task completes or needs your approval.</Text>
          <View style={{ marginTop: space.md }}>
            <Button title="Enable push notifications" variant="ghost" onPress={enablePush} loading={busy} />
          </View>
          {pushState ? <Text style={styles.note}>{pushState}</Text> : null}
        </Card>

        <View style={styles.gap} />
        <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.sm },
  body2: { color: colors.textDim, fontSize: 14 },
  gap: { height: space.lg },
  label: { color: colors.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  note: { color: colors.textDim, fontSize: 13, marginTop: space.md },
})
