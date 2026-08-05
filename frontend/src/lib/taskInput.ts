import type { Project } from '../api/types'

export interface ParsedTaskInput {
  /** The title with any `#tag` removed. Never empty when the raw input wasn't. */
  cleanTitle: string
  /** An existing project matched by `#tag`, or null. */
  projectId: number | null
  /** A `#tag` that matched nothing and should become a new project, or null. */
  newProjectName: string | null
}

/**
 * Splits a quick-add string like `Ship the docs #Platform` into a title and a
 * target project.
 *
 * Extracted from QuickAddTask so the command palette can reuse the exact same
 * `#tag` rules rather than growing a second, subtly different copy.
 *
 * `projects` should exclude the `...` default projects — tags only ever refer
 * to real, user-named ones.
 */
export function parseTaskInput(rawTitle: string, projects: Project[]): ParsedTaskInput {
  const trimmed = rawTitle.trim()

  // Prefer a trailing tag (which may contain spaces), else the first one.
  const tagMatch = trimmed.match(/#([^\s#]+(?:\s+[^\s#]+)*)$/) || trimmed.match(/#([^\s#]+)/)
  if (!tagMatch) {
    return { cleanTitle: trimmed, projectId: null, newProjectName: null }
  }

  const fullHash = tagMatch[0]
  const tagText = tagMatch[1].trim()
  const cleanTitle = trimmed.replace(fullHash, '').trim()

  // Exact name first, then a partial match — typing "#plat" should still find
  // "Platform migration" rather than creating a second project.
  const existing =
    projects.find(
      (p) =>
        p.name.toLowerCase() === tagText.toLowerCase() ||
        p.name.toLowerCase() === fullHash.substring(1).toLowerCase(),
    ) ?? projects.find((p) => p.name.toLowerCase().includes(tagText.toLowerCase()))

  if (existing) {
    // A bare "#Project" with no other words becomes a task named after it.
    return {
      cleanTitle: cleanTitle || existing.name,
      projectId: existing.id,
      newProjectName: null,
    }
  }

  return {
    cleanTitle: cleanTitle || tagText,
    projectId: null,
    newProjectName: tagText,
  }
}
