/**
 * Ranking for command-palette results. Deliberately dependency-free and
 * tier-based rather than a fuzzy library: the corpus is small (pages, projects
 * and the user's own task titles) and predictable ordering matters more than
 * clever matching.
 */

const TIER_EXACT = 1000
const TIER_PREFIX = 800
const TIER_WORD_PREFIX = 600
const TIER_SUBSTRING = 400
const TIER_SUBSEQUENCE = 200

/** Shorter matches win ties — "Plan" should beat "Planning retrospective". */
const LENGTH_PENALTY = 0.1

function subsequenceScore(query: string, text: string): number | null {
  let ti = 0
  let gaps = 0
  for (const char of query) {
    const found = text.indexOf(char, ti)
    if (found === -1) return null
    gaps += found - ti
    ti = found + 1
  }
  return TIER_SUBSEQUENCE - Math.min(gaps, 150)
}

/**
 * How well `text` matches `query`. Higher is better; null means no match at
 * all. An empty query matches everything with a neutral score.
 */
export function score(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0

  const base = (() => {
    if (t === q) return TIER_EXACT
    if (t.startsWith(q)) return TIER_PREFIX
    // Match at the start of any word: "ret" hits "Quarterly retro".
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) {
      return TIER_WORD_PREFIX
    }
    if (t.includes(q)) return TIER_SUBSTRING
    return subsequenceScore(q, t)
  })()

  if (base === null) return null
  return base - t.length * LENGTH_PENALTY
}
