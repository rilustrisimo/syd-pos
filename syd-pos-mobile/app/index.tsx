import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuthStore } from '../store/auth'

export default function IndexRoute() {
  const user = useAuthStore((state) => state.user)
  const hydrated = useAuthStore((state) => state.hydrated)
  const sessionChecked = useAuthStore((state) => state.sessionChecked)

  if (!hydrated || !sessionChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (user) {
    return <Redirect href="/(tabs)/sales" />
  }

  return <Redirect href="/(auth)/login" />
}
