import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/auth'
import { colors } from '@/theme'

export default function Index() {
  const { session, loading } = useAuth()
  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>
  }
  return <Redirect href={session ? '/(tabs)' : '/sign-in'} />
}
