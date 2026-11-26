import React from 'react'
import { Redirect, Tabs } from 'expo-router'
import { Text, type ColorValue } from 'react-native'
import { useAuth } from '@/auth'
import { colors } from '@/theme'

function Icon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>
}

export default function TabsLayout() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Projects', tabBarIcon: ({ color }) => <Icon glyph="▦" color={color} /> }} />
      <Tabs.Screen name="devices" options={{ title: 'Devices', tabBarIcon: ({ color }) => <Icon glyph="▢" color={color} /> }} />
      <Tabs.Screen name="command" options={{ title: 'Command', tabBarIcon: ({ color }) => <Icon glyph="➤" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Icon glyph="⚙" color={color} /> }} />
    </Tabs>
  )
}
