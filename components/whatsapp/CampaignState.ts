import { WAContact } from "@/types/whatsapp"

let selectedContacts: WAContact[] = []
let listeners: Array<(contacts: WAContact[]) => void> = []

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
  }
}
