import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useLogin, useSignup } from '../api/hooks'

type Mode = 'signup' | 'login'

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[10px] font-bold uppercase tracking-[.09em] text-ink-3"
    >
      {children}
    </label>
  )
}

export function WelcomeView() {
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const signup = useSignup()
  const login = useLogin()

  const pending = signup.isPending || login.isPending
  const error = mode === 'signup' ? signup.error : login.error

  const switchMode = (next: Mode) => {
    setMode(next)
    signup.reset()
    login.reset()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    if (mode === 'signup') signup.mutate({ email, password, invite_code: inviteCode })
    else login.mutate({ email, password })
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[360px]">
        <div className="mb-2 flex items-center justify-center gap-2 font-serif text-[22px] font-semibold tracking-[-0.4px] text-accent">
          <svg width="26" height="26" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="5" fill="var(--accent)" />
            <path d="M5 7h10M5 10h7M5 13h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          FlowTask
        </div>
        <p className="mb-6 text-center text-[13px] leading-[1.6] text-ink-2">
          Plan your day, focus on what must get done, and build habits that stick.
        </p>

        <form className="card p-5" onSubmit={onSubmit}>
          <h2 className="mb-4 font-serif text-[16px] font-semibold">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>

          <FieldLabel htmlFor="auth-email">Email</FieldLabel>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            className="input mb-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <FieldLabel htmlFor="auth-password">Password</FieldLabel>
          <input
            id="auth-password"
            type="password"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="input mb-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === 'signup' && (
            <>
              <FieldLabel htmlFor="auth-invite">Invite code</FieldLabel>
              <input
                id="auth-invite"
                type="text"
                required
                autoComplete="off"
                className="input mb-3"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </>
          )}

          {error && (
            <div className="mb-3 rounded-md bg-must-2 px-3 py-2 text-[12px] font-medium text-must">
              {error instanceof ApiError
                ? error.message
                : 'Something went wrong. Please try again.'}
            </div>
          )}

          <button type="submit" className="btn btn-p w-full justify-center" disabled={pending}>
            {mode === 'signup'
              ? signup.isPending
                ? 'Creating account…'
                : 'Create account'
              : login.isPending
                ? 'Logging in…'
                : 'Log in'}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-ink-3">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => switchMode('login')}
              >
                Log in
              </button>
            </>
          ) : (
            <>
              Need an account?{' '}
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => switchMode('signup')}
              >
                Sign up
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
