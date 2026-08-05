import { useEffect, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useNavigate,
  type RouterHistory,
} from '@tanstack/react-router'
import { Sidebar } from './components/Sidebar'
import { UndoToastProvider } from './components/UndoToast'
import { setSurfaceResolver, takeNavCause, track } from './lib/analytics'
import { HotkeyProvider } from './lib/hotkeys/HotkeyProvider'
import { useGlobalHotkeys } from './lib/hotkeys/useGlobalHotkeys'
import { OverlayHost } from './components/OverlayHost'
import { TaskNavProvider, useTaskNav } from './lib/taskNav'
import { TodayView } from './views/TodayView'
import { PlanView } from './views/PlanView'
import { ReviewView } from './views/ReviewView'
import { HabitsView } from './views/HabitsView'
import { ProjectView } from './views/ProjectView'
import { ReportView } from './views/ReportView'
import { WelcomeView } from './views/WelcomeView'
import { currentUserQueryOptions, useProjects } from './api/hooks'
import { createQueryClient } from './queryClient'

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useGlobalHotkeys()
  return (
    <div className="flex h-dvh">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col gap-[5px] p-1"
            aria-label="Open menu"
          >
            <span className="block h-[2px] w-5 bg-ink" />
            <span className="block h-[2px] w-5 bg-ink" />
            <span className="block h-[2px] w-5 bg-ink" />
          </button>
        </div>
        <div className="max-w-[880px] px-4 py-6 md:px-12 md:py-9">
          <TaskNavProvider>
            <Outlet />
          </TaskNavProvider>
        </div>
      </div>
    </div>
  )
}

function LayoutWithToast() {
  return (
    <HotkeyProvider>
      <UndoToastProvider>
        <OverlayHost>
          <Layout />
        </OverlayHost>
      </UndoToastProvider>
    </HotkeyProvider>
  )
}

interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

interface WelcomeSearch {
  oauth_error?: string
}

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: WelcomeView,
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => ({
    oauth_error: typeof search.oauth_error === 'string' ? search.oauth_error : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient
      .ensureQueryData(currentUserQueryOptions)
      .catch(() => null)
    if (user) throw redirect({ to: '/' })
  },
})

// Pathless layout route: every child requires a session.
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  component: LayoutWithToast,
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(currentUserQueryOptions)
    } catch {
      throw redirect({ to: '/welcome' })
    }
  },
})

const todayRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: TodayView,
})

const planRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/plan',
  component: PlanView,
})

const reviewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/review',
  component: ReviewView,
})

const habitsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/habits',
  component: HabitsView,
})

const reportRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/report',
  component: ReportView,
})

function ProjectRouteComponent() {
  const { projectId } = projectRoute.useParams()
  const { task: jumpToTaskId } = projectRoute.useSearch()
  const { data: projects = [] } = useProjects()
  const navigate = useNavigate()
  const nav = useTaskNav()
  const project = projects.find((p) => p.id === Number(projectId))

  // A command-palette task jump arrives as ?task=<id>. Rows register during
  // commit, so by the time this effect runs the target is focusable. Strip the
  // param afterwards so a reload or a back-navigation doesn't repeat the jump.
  useEffect(() => {
    if (!jumpToTaskId || !project) return
    if (nav.focus(jumpToTaskId)) navigate({ to: '.', search: {}, replace: true })
  }, [jumpToTaskId, project, nav, navigate])

  if (!project) return null
  return <ProjectView project={project} />
}

interface ProjectSearch {
  /** Set by a command-palette task jump; consumed and stripped by ProjectView. */
  task?: number
}

const projectRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/projects/$projectId',
  component: ProjectRouteComponent,
  validateSearch: (search: Record<string, unknown>): ProjectSearch => {
    const task = Number(search.task)
    return Number.isFinite(task) && task > 0 ? { task } : {}
  },
})

const routeTree = rootRoute.addChildren([
  welcomeRoute,
  authedRoute.addChildren([todayRoute, planRoute, reviewRoute, habitsRoute, reportRoute, projectRoute]),
])

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({ routeTree, context: { queryClient }, history })
}

export const queryClient = createQueryClient({
  currentPath: () => router.state.location.pathname,
  redirectToWelcome: () => {
    // Drop any cached session so the /welcome guard doesn't bounce back to '/'.
    queryClient.removeQueries({ queryKey: ['auth'] })
    router.navigate({ to: '/welcome' })
  },
})

export const router = createAppRouter(queryClient)

/** Route path -> the `surface` recorded on events and outbound mutations. */
const SURFACE_BY_ROUTE: Record<string, string> = {
  '/': 'today',
  '/plan': 'plan',
  '/review': 'review',
  '/habits': 'habits',
  '/report': 'report',
}

function surfaceForPath(path: string): string | null {
  if (path.startsWith('/projects/')) return 'project'
  return SURFACE_BY_ROUTE[path] ?? null
}

setSurfaceResolver(() => surfaceForPath(router.state.location.pathname))

router.subscribe('onResolved', ({ toLocation }) => {
  const to = surfaceForPath(toLocation.pathname)
  track('nav.view', { to: to ?? 'other', via: takeNavCause() })
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
