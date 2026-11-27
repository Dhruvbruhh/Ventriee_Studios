import React from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import * as ReactNative from 'react-native'
import { AuthProvider, useAuth } from '@/auth'
import { WorkspaceProvider } from '@/workspace'
import { registerForPushNotifications } from '@/notifications'
import { registerPushToken } from '@/cloud'
import { isConfigured } from '@/config'
import { colors } from '@/theme'

// Show notifications while the app is foregrounded (used once push delivery is wired).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
})

// Ask once per sign-in for a push token and store it server-side. Best effort:
// simulators, denied permissions or a missing EAS project id all just skip.
function PushRegistration() {
  const { userId } = useAuth()
  React.useEffect(() => {
    if (!userId || !isConfigured) return
    void (async () => {
      const { token, reason } = await registerForPushNotifications()
      if (!token) {
        if (reason) console.log('Push registration skipped:', reason)
        return
      }
      const platform = ReactNative.Platform.OS as 'ios' | 'android'
      try { await registerPushToken(userId, token, platform) } catch (e) { console.log('Push registration failed:', e) }
    })()
  }, [userId])
  return null
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <PushRegistration />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
            <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
          </Stack>
        </WorkspaceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
