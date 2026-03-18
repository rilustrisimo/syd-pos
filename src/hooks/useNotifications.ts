'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { NotificationRow } from '@/types/database'
import { useAuthStore } from '@/lib/stores/auth'

export type Notification = NotificationRow

const NOTIFICATION_LIMIT = 50

const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
}

// Fetch all notifications for the current user's role
export function useNotifications() {
  const user = useAuthStore(state => state.user)

  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: async () => {
      if (!user?.role) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .contains('target_roles', [user.role])
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIMIT)

      if (error) throw new Error(`Failed to fetch notifications: ${error.message}`)
      return (data || []) as Notification[]
    },
    staleTime: 1000 * 30,  // 30 seconds
    refetchInterval: 1000 * 60,  // poll every minute
    enabled: !!user,
  })
}

export function useUnreadNotificationCount() {
  const user = useAuthStore(state => state.user)

  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => {
      if (!user?.role) return 0
      const supabase = createClient()
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .contains('target_roles', [user.role])
        .eq('is_read', false)

      if (error) throw new Error(error.message)
      return count || 0
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
    enabled: !!user,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)

  return useMutation({
    mutationFn: async () => {
      if (!user?.role) return
      const supabase = createClient()
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .contains('target_roles', [user.role])
        .eq('is_read', false)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}
