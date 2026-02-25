import { Redirect, Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../store/auth'

export default function TabsLayout() {
  const user          = useAuthStore((state) => state.user)
  const hydrated      = useAuthStore((state) => state.hydrated)
  const sessionChecked = useAuthStore((state) => state.sessionChecked)

  if (!hydrated || !sessionChecked) return null
  if (!user) return <Redirect href="/(auth)/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="sales/index"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history/index"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history/[id]"
        options={{
          href: null,          // hidden from tab bar — navigated to programmatically
          title: 'Transaction',
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="returns/index"
        options={{
          title: 'Returns',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="return-up-back-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports/index"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
