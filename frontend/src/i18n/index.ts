import { useEffect, useState } from 'react'
import i18n, { type TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ru from './ru.json'

export type Language = 'en' | 'ru'
const KEY = 'dtask_lang'

export function detectLanguage(): Language {
  const stored = localStorage.getItem(KEY)
  if (stored === 'en' || stored === 'ru') return stored
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  // Resources are bundled, so init synchronously: t() is usable right away
  // and components never suspend waiting for catalogs.
  initAsync: false,
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language

export function useLanguage() {
  const [lang, setLang] = useState<Language>(() => detectLanguage())

  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem(KEY, lang)
    i18n.changeLanguage(lang)
  }, [lang])

  const toggle = () => setLang((l) => (l === 'en' ? 'ru' : 'en'))
  return { lang, toggle }
}

/**
 * Display label for a project group. The two default groups are stored in the
 * DB as the English strings 'Work'/'Personal' and localized at render time;
 * user-created groups are shown as-is.
 */
export function groupLabel(t: TFunction, group: string): string {
  if (group === 'Work') return t('groups.work')
  if (group === 'Personal') return t('groups.personal')
  return group
}

export default i18n
