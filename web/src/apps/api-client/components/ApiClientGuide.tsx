import { BookOpen, PlugZap, ShieldCheck } from 'lucide-react'

const STEPS = [
  {
    title: '1. Send a login request',
    description: 'Use the HTTP workspace to call your auth endpoint and inspect the response body or headers.'
  },
  {
    title: '2. Save the token to an environment',
    description: 'Select the token in the response body, right-click, then save it as TOKEN in your active environment.'
  },
  {
    title: '3. Reuse it as Bearer auth',
    description: 'In the Auth tab, choose Bearer Token and enter {{TOKEN}} to inject the saved value into future requests.'
  }
]

export default function ApiClientGuide() {
  return (
    <div className="flex-1 overflow-auto p-6" style={{ background: 'var(--vos-bg-surface)' }}>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-start gap-4 rounded-2xl p-5" style={{ background: 'var(--vos-bg-secondary)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--vos-bg-tertiary)' }}>
            <BookOpen size={20} style={{ color: 'var(--vos-accent-primary)' }} />
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
              API Client Workflow Guide
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
              This workspace now supports the full login → save token → reuse token chain directly inside the app.
            </div>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {STEPS.map(step => (
            <div key={step.title} className="rounded-2xl p-5" style={{ background: 'var(--vos-bg-secondary)' }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
                {step.title}
              </div>
              <div className="mt-2 text-sm leading-6" style={{ color: 'var(--vos-text-secondary)' }}>
                {step.description}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="rounded-2xl p-5" style={{ background: 'var(--vos-bg-secondary)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
              <ShieldCheck size={16} />
              Environment Secrets
            </div>
            <div className="mt-2 text-sm leading-6" style={{ color: 'var(--vos-text-secondary)' }}>
              Mark tokens and passwords as secret so they render masked in the environment panel while staying reusable.
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: 'var(--vos-bg-secondary)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
              <PlugZap size={16} />
              Realtime Protocols
            </div>
            <div className="mt-2 text-sm leading-6" style={{ color: 'var(--vos-text-secondary)' }}>
              Use the left Activity Bar to jump between HTTP, WebSocket, and MQTT testing without leaving the current app window.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}