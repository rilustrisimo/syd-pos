import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '../../store/auth'

export default function AuthLayout() {
  const user = useAuthStore((state) => state.user)
  const hydrated = useAuthStore((state) => state.hydrated)
  const sessionChecked = useAuthStore((state) => state.sessionChecked)

  // Don't render auth screens if not hydrated/checked yet (will show root loading)
  if (!hydrated || !sessionChecked) {
    return null
  }

  // Redirect to sales if already authenticated
  if (user) {
    return <Redirect href="/(tabs)/sales" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
