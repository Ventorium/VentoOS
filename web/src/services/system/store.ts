/**
 * System State Service
 *
 * System-level state: clock, battery, network, reduced-motion.
 * This is shell-level state that doesn't fit neatly into "services" —
 * it monitors browser/OS APIs and has no backend counterpart.
 */

import { create } from 'zustand'

interface BatteryManager extends EventTarget {
  charging: boolean
  level: number
  onchargingchange: ((this: BatteryManager, ev: Event) => unknown) | null
  onlevelchange: ((this: BatteryManager, ev: Event) => unknown) | null
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>
}

interface SystemStore {
  clock: Date
  batteryLevel: number | null
  isCharging: boolean | null
  isOnline: boolean
  isReducedMotion: boolean
  isLowPower: boolean

  tick: () => void
  setBattery: (level: number, charging: boolean) => void
  setOnline: (online: boolean) => void
  setReducedMotion: (v: boolean) => void

  /** Call once at app start to wire up system event listeners. Returns cleanup. */
  initSystemMonitors: () => () => void
}

export const useSystemStore = create<SystemStore>((set, get) => ({
  clock: new Date(),
  batteryLevel: null,
  isCharging: null,
  isOnline: navigator.onLine,
  isReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  isLowPower: false,

  tick() {
    set({ clock: new Date() })
  },

  setBattery(level, charging) {
    set({ batteryLevel: Math.round(level * 100), isCharging: charging, isLowPower: level < 0.2 && !charging })
  },

  setOnline(online) {
    set({ isOnline: online })
  },

  setReducedMotion(v) {
    set({ isReducedMotion: v })
  },

  initSystemMonitors() {
    // Clock tick every second
    const clockTimer = setInterval(() => get().tick(), 1_000)

    // Battery
    const nav = navigator as NavigatorWithBattery
    let battery: BatteryManager | null = null
    if (nav.getBattery) {
      nav.getBattery().then(b => {
        battery = b
        get().setBattery(b.level, b.charging)
        b.onchargingchange = () => get().setBattery(b.level, b.charging)
        b.onlevelchange = () => get().setBattery(b.level, b.charging)
      }).catch(() => {})
    }

    // Network
    const handleOnline = () => get().setOnline(true)
    const handleOffline = () => get().setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Reduced motion
    const motionMq = matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotion = (e: MediaQueryListEvent) => get().setReducedMotion(e.matches)
    motionMq.addEventListener('change', handleMotion)

    return () => {
      clearInterval(clockTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      motionMq.removeEventListener('change', handleMotion)
      if (battery) {
        battery.onchargingchange = null
        battery.onlevelchange = null
      }
    }
  },
}))
