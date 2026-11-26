import React, { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, StyleSheet } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/auth'
import { isConfigured } from '@/config'
import { Button, Field, StateView } from '@/components/ui'
import { colors, space } from '@/theme'

export default function SignIn() {
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (session) return <Redirect href="/(tabs)" />

  async function submit() {
    setError(null)
    setNotice(null)
    if (!email.includes('@') || password.length < 1) { setError('Enter your email and password.'); return }
    setBusy(true)
    try {
      if (mode === 'in') {
        await signIn(email, password)
      } else {
        const { needsConfirmation } = await signUp(email, password)
        if (needsConfirmation) setNotice('Check your email to confirm your account, then sign in.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Ventriee</Text>
        <Text style={styles.tagline}>Your studio, in your pocket.</Text>

        {!isConfigured ? (
          <View style={styles.notice}>
            <StateView error={'Supabase isn’t configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).'} />
          </View>
        ) : (
          <>
            <Field placeholder="you@studio.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
            <View style={{ height: space.md }} />
            <Field placeholder="Password" secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice2}>{notice}</Text> : null}
            <View style={{ height: space.lg }} />
            <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
            <View style={{ height: space.md }} />
            <Button
              title={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
              variant="ghost"
              onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); setNotice(null) }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: space.xl },
  brand: { color: colors.text, fontSize: 36, fontWeight: '800', textAlign: 'center' },
  tagline: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: space.xs, marginBottom: space.xl },
  error: { color: colors.danger, marginTop: space.md },
  notice: { marginTop: space.lg },
  notice2: { color: colors.success, marginTop: space.md },
})
