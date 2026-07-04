import type { ReactNode } from 'react'

export type IconName =
  | 'today'
  | 'plan'
  | 'review'
  | 'habits'
  | 'folder'
  | 'plus'
  | 'moon'
  | 'sun'
  | 'fire'
  | 'check'
  | 'note'
  | 'trash'
  | 'logout'
  | 'globe'

const paths = (c: string): Record<IconName, ReactNode> => ({
  today: (
    <path
      d="M5 1v2h6V1h1.5v2H14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1.5V1H5zm8 5H3v8h10V6z"
      fill={c}
    />
  ),
  plan: (
    <>
      <path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h7v2H2z" fill={c} />
      <path d="M13 11l3 2-3 2v-4z" fill={c} />
    </>
  ),
  review: (
    <>
      <circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.5" fill="none" />
      <path d="M8 5.5v3l1.5 1.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  ),
  habits: (
    <>
      <rect x="1" y="3" width="4" height="4" rx="1" fill={c} />
      <rect x="6" y="3" width="4" height="4" rx="1" fill={c} opacity=".6" />
      <rect x="11" y="3" width="4" height="4" rx="1" fill={c} opacity=".3" />
      <rect x="1" y="9" width="4" height="4" rx="1" fill={c} opacity=".6" />
      <rect x="6" y="9" width="4" height="4" rx="1" fill={c} />
      <rect x="11" y="9" width="4" height="4" rx="1" fill={c} opacity=".6" />
    </>
  ),
  folder: (
    <path
      d="M2 4a1 1 0 0 1 1-1h4.5l2 2H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
      fill={c}
    />
  ),
  plus: <path d="M8 3v10M3 8h10" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" />,
  moon: <path d="M13 9A7 7 0 0 1 5 3a7 7 0 1 0 8 6z" fill={c} />,
  sun: (
    <>
      <circle cx="8" cy="8" r="2.5" fill={c} />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4l1.4-1.4M11 5l1.4-1.4"
        stroke={c}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  fire: (
    <path
      d="M8 2s-4 4-4 7a4 4 0 0 0 8 0c0-2.5-2-5-2-5s-.5 2-2 2C8 4 9 2 8 2z"
      fill={c}
    />
  ),
  check: <path d="M3 8l3.5 3.5L13 5" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" />,
  note: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke={c} strokeWidth="1.5" fill="none" />
      <path d="M5 6h6M5 9h4" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  ),
  trash: (
    <path
      d="M3 4h10M6.5 4V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M4.5 4l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  logout: (
    <path
      d="M6.5 2H3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10.5 5l3 3-3 3M13 8H6.5"
      stroke={c}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.4" fill="none" />
      <ellipse cx="8" cy="8" rx="2.7" ry="6" stroke={c} strokeWidth="1.2" fill="none" />
      <path d="M2 8h12" stroke={c} strokeWidth="1.2" fill="none" />
    </>
  ),
})

export function Ic({ n, s = 15, c = 'currentColor' }: { n: IconName; s?: number; c?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {paths(c)[n]}
    </svg>
  )
}
