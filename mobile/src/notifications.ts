// Expo push notifications for task completion / approvals.
//
// STUB — wired but not delivered end-to-end. Registering for a real Expo push token
// needs an EAS project id (and APNs/FCM credentials on the EAS side) that aren't
// available in this environment, so registerForPushNotifications() returns the token
// if everything is configured and otherwise returns null with a reason. The real
// backend piece (store the token server-side; have the desktop/W5 send a push on task
// completion or a new approval) is the INTEGRATION POINT marked below.
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

export interface PushRegistration {
  token: string | null
  /** Why registration did not yield a token (for display / logs). */
  reason?: string
}

/**
 * Ask for permission and return the Expo push token, or a reason it couldn't.
 * Safe to call on a simulator — it just reports that a physical device is required.
 */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (!Device.isDevice) return { token: null, reason: 'Push notifications need a physical device.' }

  const existing = await Notifications.getPermissionsAsync()
  let status = existing.status
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') return { token: null, reason: 'Notification permission was not granted.' }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    // INTEGRATION POINT: set an EAS projectId (app.json > extra.eas.projectId) and
    // the APNs/FCM credentials in EAS, then this returns a real token.
    return { token: null, reason: 'No EAS projectId configured yet (see notifications.ts).' }
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId })
    // INTEGRATION POINT: persist `data` server-side (e.g. a push_tokens table keyed by
    // user_id) so W5 / the desktop can send a push on task completion or a new approval.
    return { token: data }
  } catch (e) {
    return { token: null, reason: e instanceof Error ? e.message : 'Could not get a push token.' }
  }
}
