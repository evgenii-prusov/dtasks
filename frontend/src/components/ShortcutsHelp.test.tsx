import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutsHelp } from './ShortcutsHelp'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('ShortcutsHelp', () => {
  it('renders shortcut titles and groups in columns', () => {
    const onClose = vi.fn()
    const { container } = render(<ShortcutsHelp onClose={onClose} />)

    expect(screen.getByText('hotkeys.title')).toBeInTheDocument()
    expect(screen.getByText('hotkeys.groupNavigation')).toBeInTheDocument()
    expect(screen.getByText('hotkeys.groupTasks')).toBeInTheDocument()
    expect(screen.getByText('hotkeys.groupGeneral')).toBeInTheDocument()

    const columns = container.querySelectorAll('.shortcuts-column')
    expect(columns.length).toBe(2)
  })

  it('scrolls overlay via keyboard navigation keys', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<ShortcutsHelp onClose={onClose} />)

    const grid = container.querySelector('.shortcuts-grid') as HTMLDivElement
    expect(grid).toBeInTheDocument()

    // Mock scrollBy and scrollTo for jsdom environment
    grid.scrollBy = vi.fn()
    grid.scrollTo = vi.fn()

    const dialog = screen.getByRole('dialog')
    dialog.focus()

    await user.keyboard('{ArrowDown}')
    expect(grid.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ top: expect.any(Number), behavior: 'smooth' }),
    )

    await user.keyboard('j')
    expect(grid.scrollBy).toHaveBeenCalled()

    await user.keyboard('{ArrowUp}')
    expect(grid.scrollBy).toHaveBeenCalled()

    await user.keyboard('k')
    expect(grid.scrollBy).toHaveBeenCalled()

    await user.keyboard('{PageDown}')
    expect(grid.scrollBy).toHaveBeenCalled()

    await user.keyboard('{PageUp}')
    expect(grid.scrollBy).toHaveBeenCalled()

    await user.keyboard('{Home}')
    expect(grid.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0, behavior: 'smooth' }),
    )

    await user.keyboard('{End}')
    expect(grid.scrollTo).toHaveBeenCalled()
  })

  it('closes when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ShortcutsHelp onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
