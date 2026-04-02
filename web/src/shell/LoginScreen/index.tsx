/**
 * LoginScreen — branded lock / setup screen
 *
 * Modes:
 *  - setup:   first-time password initialization
 *  - unlock:  standard login / lock screen
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import BrandLogo from '@/components/BrandLogo'
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
      <div className="vos-lock-bg" />
      <div className="vos-lock-liquid vos-lock-liquid-left" />
      <div className="vos-lock-liquid vos-lock-liquid-right" />
      <div className="vos-lock-glow" />

      <LockClock />

      <div className="vos-lock-main">
        <motion.section
          className="vos-lock-hero"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="vos-lock-brand-mark">
            <BrandLogo size={172} />
          </div>
          <div className="vos-lock-brand-copy">
            <p className="vos-lock-kicker">VentoOS System</p>
            <h2 className="vos-lock-title">{mode === 'setup' ? '设置访问密码' : 'VentoOS'}</h2>
            <p className="vos-lock-subtitle">
              {mode === 'setup' ? '首次使用，请设置一个访问密码' : '输入密码以继续访问你的基础设施工作台'}
            </p>
          </div>
        </motion.section>

        <motion.div
          className="vos-lock-card"
          initial={{ opacity: 0, y: 28 }}
          animate={
            shaking
              ? {
                  opacity: 1,
                  y: 0,
                  x: [-10, 10, -8, 8, -5, 5, 0],
                  transition: { duration: 0.4 }
                }
              : { opacity: 1, y: 0, x: 0 }
          }
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="vos-lock-panel-head">
            <div className="vos-lock-panel-icon">
              {mode === 'setup' ? <ShieldCheck size={18} strokeWidth={1.8} /> : <Lock size={18} strokeWidth={1.8} />}
            </div>
            <div>
              <div className="vos-lock-panel-title">{mode === 'setup' ? '初始化安全访问' : '解锁系统'}</div>
              <div className="vos-lock-panel-subtitle">
                {mode === 'setup' ? '创建本地访问密码' : '本地验证，不上传到前端之外的存储'}
              </div>
            </div>
          </div>

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
                    border: '2px solid rgba(255,255,255,0.35)',
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
      </div>
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
