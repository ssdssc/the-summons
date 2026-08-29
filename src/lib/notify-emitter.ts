import { EventEmitter } from 'node:events'

export type NotificationType =
  | 'streak'
  | 'comeback'
  | 'streak_lost'
  | 'overtake'
  | 'fast'
  | 'first'

export interface NotifyPayload {
  type: NotificationType
  schoolName: string
  memberName: string
  subject: string
  count: number | string
}

const globalForNotify = globalThis as unknown as {
  __notifyEmitter?: EventEmitter
}

if (!globalForNotify.__notifyEmitter) {
  globalForNotify.__notifyEmitter = new EventEmitter()
  globalForNotify.__notifyEmitter.setMaxListeners(100)
}

export const notifyEmitter = globalForNotify.__notifyEmitter
