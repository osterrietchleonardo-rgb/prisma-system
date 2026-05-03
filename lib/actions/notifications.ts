"use server"

import { createClient } from "@/lib/supabase/server"

export async function getNotifications() {
  const supabase = await createClient()
  
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error("Error fetching notifications:", error)
    return []
  }

  return notifications
}

export async function markNotificationAsRead(id: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)

  if (error) {
    console.error("Error marking notification as read:", error)
    return false
  }

  return true
}
