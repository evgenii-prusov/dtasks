import { describe, expect, it } from 'vitest'
import { detectLanguage } from './index'
import en from './en.json'
import ru from './ru.json'

function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

// Locales need different plural forms (en: one/other, ru: one/few/many/other),
// so parity is checked on base keys with the plural suffix stripped.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
function baseKeysOf(obj: Record<string, unknown>): string[] {
  return [...new Set(keysOf(obj).map((k) => k.replace(PLURAL_SUFFIX, '')))].sort()
}

describe('i18n catalogs', () => {
  it('ru has exactly the same keys as en (modulo plural forms)', () => {
    expect(baseKeysOf(ru)).toEqual(baseKeysOf(en))
  })

  it('has no empty messages', () => {
    for (const catalog of [en, ru]) {
      const walk = (obj: Record<string, unknown>) => {
        for (const v of Object.values(obj)) {
          if (v !== null && typeof v === 'object') walk(v as Record<string, unknown>)
          else expect(String(v).trim()).not.toBe('')
        }
      }
      walk(catalog)
    }
  })
})

describe('detectLanguage', () => {
  it('prefers the stored choice over the browser language', () => {
    localStorage.setItem('dtask_lang', 'ru')
    expect(detectLanguage()).toBe('ru')
    localStorage.removeItem('dtask_lang')
  })

  it('ignores invalid stored values and falls back to the browser language', () => {
    localStorage.setItem('dtask_lang', 'de')
    expect(detectLanguage()).toBe('en')
    localStorage.removeItem('dtask_lang')
  })

  it('picks Russian for ru-* browser locales', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'language')
    Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true })
    expect(detectLanguage()).toBe('ru')
    if (original) Object.defineProperty(window.navigator, 'language', original)
  })
})
