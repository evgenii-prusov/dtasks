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
 * A `...` catch-all project reachable by tag under readable names — the
 * English group ("Work") and its translated label ("Work (Default)"). Callers
 * supply these because the labels are localised and the parser is not.
 */
export interface DefaultProjectAlias {
  project: Project
  aliases: string[]
}

/**
 * Splits a quick-add string like `Ship the docs #Platform` into a title and a
 * target project.
 *
 * Extracted from QuickAddTask so the command palette can reuse the exact same
 * `#tag` rules rather than growing a second, subtly different copy.
 *
 * `projects` should exclude the `...` default projects — tags only ever refer
 * to real, user-named ones. Pass those separately as `defaults` to let
 * `#Work` / `#Personal` name the two catch-all projects.
 */
export function parseTaskInput(
  rawTitle: string,
  projects: Project[],
  defaults: DefaultProjectAlias[] = [],
): ParsedTaskInput {
  const trimmed = rawTitle.trim()

  // Prefer a trailing tag (which may contain spaces), else the first one.
  const tagMatch = trimmed.match(/#([^\s#]+(?:\s+[^\s#]+)*)$/) || trimmed.match(/#([^\s#]+)/)
  if (!tagMatch) {
    return { cleanTitle: trimmed, projectId: null, newProjectName: null }
  }

  const fullHash = tagMatch[0]
  const tagText = tagMatch[1].trim()
  const cleanTitle = trimmed.replace(fullHash, '').trim()

  const namesTag = (name: string) => {
    const lower = name.toLowerCase()
    return lower === tagText.toLowerCase() || lower === fullHash.substring(1).toLowerCase()
  }

  // Exact name first, then a partial match — typing "#plat" should still find
  // "Platform migration" rather than creating a second project. An exactly
  // typed "#Work" names the default section, so it outranks merely containing
  // the word ("Real Work Project") but still yields to a project called Work.
  const exact = projects.find((p) => namesTag(p.name))
  const defaultMatch = exact ? undefined : defaults.find((d) => d.aliases.some(namesTag))
  if (defaultMatch) {
    return {
      cleanTitle: cleanTitle || tagText,
      projectId: defaultMatch.project.id,
      newProjectName: null,
    }
  }

  const existing =
    exact ?? projects.find((p) => p.name.toLowerCase().includes(tagText.toLowerCase()))

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
