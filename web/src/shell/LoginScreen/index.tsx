/**
 * LoginScreen — macOS-style lock / setup screen
 *
 * Modes:
 *  - setup:   first-time password initialization
 *  - unlock:  standard login / lock screen
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authService, useAuthStore } from '@/services/auth'

type Mode = 'unlock' | 'setup'

export default function LoginScreen() {
  const { initialized, setInitialized } = useAuthStore()
  const [mode, setMode] = useState<Mode>(initialized ? 'unlock' : 'setup')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shaking, setShaking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMode(initialized ? 'unlock' : 'setup')
  }, [initialized])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  const shake = () => {
    setShaking(true)
    setTimeout(() => setShaking(false), 500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (mode === 'setup') {
      if (password.length < 6) {
        setError('密码至少需要 6 位')
        shake()
        return
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致')
        shake()
        return
      }
      setLoading(true)
      try {
        await authService.setup(password)
        setInitialized(true)
        // Auto login after setup
        await authService.login(password)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '设置失败')
        shake()
      } finally {
        setLoading(false)
      }
    } else {
      if (!password) {
        shake()
        return
      }
      setLoading(true)
      try {
        await authService.login(password)
      } catch {
        setError('密码错误')
        setPassword('')
        shake()
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <motion.div className="vos-lock-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Blurred background */}
      <div className="vos-lock-bg" />

      <motion.div
        className="vos-lock-card"
        animate={
          shaking
            ? {
                x: [-10, 10, -8, 8, -5, 5, 0],
                transition: { duration: 0.4 }
              }
            : {}
        }
      >
        {/* Avatar / icon */}
        <div className="vos-lock-avatar">
          <div className="vos-lock-avatar-ring">
            {mode === 'setup' ? <ShieldCheck size={32} strokeWidth={1.5} /> : <Lock size={28} strokeWidth={1.5} />}
          </div>
        </div>

        <h2 className="vos-lock-title">{mode === 'setup' ? '设置访问密码' : 'VentoOS'}</h2>
        <p className="vos-lock-subtitle">{mode === 'setup' ? '首次使用，请设置一个访问密码' : '输入密码以继续使用'}</p>

        <form onSubmit={handleSubmit} className="vos-lock-form">
          <div className="vos-lock-input-wrap">
            <input
              ref={inputRef}
              type={show ? 'text' : 'password'}
              placeholder={mode === 'setup' ? '输入密码（至少 6 位）' : '密码'}
              value={password}
              onChange={e => {
                setPassword(e.target.value)
                setError('')
              }}
              className="vos-lock-input"
              autoComplete="current-password"
              autoFocus
            />
            <button type="button" className="vos-lock-show-btn" onClick={() => setShow(v => !v)} tabIndex={-1}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {mode === 'setup' && (
            <div className="vos-lock-input-wrap">
              <input
                type={show ? 'text' : 'password'}
                placeholder="确认密码"
                value={confirm}
                onChange={e => {
                  setConfirm(e.target.value)
                  setError('')
                }}
                className="vos-lock-input"
                autoComplete="new-password"
              />
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.p
                className="vos-lock-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button type="submit" className="vos-lock-btn" disabled={loading}>
            {loading ? (
              <span
                className="vos-spin"
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff',
                  borderRadius: '50%'
                }}
              />
            ) : mode === 'setup' ? (
              '设置密码'
            ) : (
              '解锁'
            )}
          </button>
        </form>
      </motion.div>

      {/* Clock */}
      <LockClock />
    </motion.div>
  )
}

function LockClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const h = time.getHours().toString().padStart(2, '0')
  const m = time.getMinutes().toString().padStart(2, '0')
  const dateStr = time.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="vos-lock-clock">
      <div className="vos-lock-clock-time">
        {h}:{m}
      </div>
      <div className="vos-lock-clock-date">{dateStr}</div>
    </div>
  )
}
