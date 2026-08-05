import { describe, expect, it } from 'vitest'
import { score } from './score'

/** Sorts candidates the way the palette does, best first. */
function rank(query: string, texts: string[]): string[] {
  return texts
    .map((text) => ({ text, value: score(query, text) }))
    .filter((x): x is { text: string; value: number } => x.value !== null)
    .sort((a, b) => b.value - a.value)
    .map((x) => x.text)
}

describe('score', () => {
  it('treats an empty query as a neutral match for everything', () => {
    expect(score('', 'anything')).toBe(0)
    expect(score('   ', 'anything')).toBe(0)
  })

  it('returns null when the query is not even a subsequence', () => {
    expect(score('zzz', 'Plan')).toBeNull()
  })

  it('is case insensitive', () => {
    expect(score('PLAN', 'plan')).toBe(score('plan', 'PLAN'))
  })

  it('orders exact above prefix above word-prefix above substring', () => {
    expect(rank('plan', ['Unplanned work', 'Quarterly plan', 'Planning', 'Plan'])).toEqual([
      'Plan',
      'Planning',
      'Quarterly plan',
      'Unplanned work',
    ])
  })

  it('matches scattered characters as a last resort', () => {
    expect(score('pln', 'Plan')).not.toBeNull()
    expect(score('pln', 'Plan')!).toBeLessThan(score('pla', 'Plan')!)
  })

  it('prefers the shorter of two equally-tiered matches', () => {
    expect(rank('re', ['Review', 'Rewrite the onboarding docs'])).toEqual([
      'Review',
      'Rewrite the onboarding docs',
    ])
  })

  it('does not treat regex metacharacters in the query as syntax', () => {
    expect(() => score('c++ (draft)', 'Learn c++ (draft)')).not.toThrow()
    expect(score('c++', 'Learn c++')).not.toBeNull()
  })
})
