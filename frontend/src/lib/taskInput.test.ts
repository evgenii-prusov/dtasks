import { describe, expect, it } from 'vitest'
import { parseTaskInput } from './taskInput'
import type { Project } from '../api/types'

const projects = [
  { id: 3, name: 'Real Work Project', group: 'Work' },
  { id: 4, name: 'Two Words', group: 'Personal' },
] as Project[]

describe('parseTaskInput', () => {
  it('returns the title unchanged when there is no tag', () => {
    expect(parseTaskInput('  Write the docs  ', projects)).toEqual({
      cleanTitle: 'Write the docs',
      projectId: null,
      newProjectName: null,
    })
  })

  it('resolves a trailing tag to an existing project', () => {
    expect(parseTaskInput('Ship it #Real Work Project', projects)).toEqual({
      cleanTitle: 'Ship it',
      projectId: 3,
      newProjectName: null,
    })
  })

  it('matches a tag case-insensitively', () => {
    expect(parseTaskInput('Ship it #two words', projects).projectId).toBe(4)
  })

  it('names the task after the project when the tag is all there is', () => {
    expect(parseTaskInput('#Two Words', projects)).toEqual({
      cleanTitle: 'Two Words',
      projectId: 4,
      newProjectName: null,
    })
  })

  it('reports an unknown tag as a project to create', () => {
    expect(parseTaskInput('Draft the brief #Marketing', projects)).toEqual({
      cleanTitle: 'Draft the brief',
      projectId: null,
      newProjectName: 'Marketing',
    })
  })

  it('lets a trailing tag run to the end of the line', () => {
    // Long-standing behavior: this is how multi-word project names like
    // "#Two Words" are recognised, so everything after the # is the tag.
    expect(parseTaskInput('Ping #Marketing about the launch', projects)).toEqual({
      cleanTitle: 'Ping',
      projectId: null,
      newProjectName: 'Marketing about the launch',
    })
  })

  it('falls back to the first tag when no trailing tag can be read', () => {
    expect(parseTaskInput('Ping #Marketing #', projects)).toMatchObject({
      newProjectName: 'Marketing',
    })
  })

  it('never returns an empty title for a non-empty input', () => {
    expect(parseTaskInput('#Marketing', projects).cleanTitle).toBe('Marketing')
  })
})
