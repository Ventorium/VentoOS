/**
 * System State Store
 *
 * Manages system-level state: clock, battery, network, motion preferences.
 * Acts as the "kernel" of the WebOS runtime.
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
  /** Current system time */
  clock: Date
  /** Battery percentage 0–100, or null if unavailable */
  batteryLevel: number | null
  /** Charging status, null if unavailable */
  isCharging: boolean | null
  /** Network connectivity */
  isOnline: boolean
  /** prefers-reduced-motion media query result */
  isReducedMotion: boolean
  /** Low power mode: battery < 20% and not charging */
  isLowPower: boolean

  tick: () => void
  setBattery: (level: number, charging: boolean) => void
  setOnline: (online: boolean) => void
  setReducedMotion: (v: boolean) => void

  /** Call once on app start to wire up system event listeners */
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
    set({
      batteryLevel: Math.round(level * 100),
      isCharging: charging,
      isLowPower: level < 0.2 && !charging
    })
  },

  setOnline(online) {
    set({ isOnline: online })
  },

  setReducedMotion(v) {
    set({ isReducedMotion: v })
  },

  initSystemMonitors() {
    const { tick, setBattery, setOnline, setReducedMotion } = get()

    // Clock ticker
    const clockTimer = setInterval(tick, 1000)

    // Online / offline
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Reduced motion
    const motionMq = matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    motionMq.addEventListener('change', handleMotion)

    // Battery API (not available in all browsers)
    const nav = navigator as NavigatorWithBattery
    if (typeof nav.getBattery === 'function') {
      nav.getBattery().then(battery => {
        setBattery(battery.level, battery.charging)

        battery.onlevelchange = () => setBattery(battery.level, battery.charging)
        battery.onchargingchange = () => setBattery(battery.level, battery.charging)
      })
    }

    // Return cleanup
    return () => {
      clearInterval(clockTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      motionMq.removeEventListener('change', handleMotion)
    }
  }
}))
