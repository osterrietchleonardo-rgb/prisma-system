import { WAContact } from "@/types/whatsapp"

let selectedContacts: WAContact[] = []
let activeTab: string = "chat"
let listeners: Array<(contacts: WAContact[]) => void> = []
let tabListeners: Array<(tab: string) => void> = []

export const CampaignState = {
  getContacts: () => selectedContacts,
  setContacts: (contacts: WAContact[]) => {
    selectedContacts = contacts
    listeners.forEach(l => l(selectedContacts))
  },
  subscribe: (listener: (contacts: WAContact[]) => void) => {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  },
  
  getActiveTab: () => activeTab,
  setActiveTab: (tab: string) => {
    activeTab = tab
    tabListeners.forEach(l => l(activeTab))
  },
  subscribeToTab: (listener: (tab: string) => void) => {
    tabListeners.push(listener)
    return () => {
      tabListeners = tabListeners.filter(l => l !== listener)
    }
  }
}
