import { useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import { Sidebar } from './components/Sidebar'
import { TodayView } from './views/TodayView'
import { PlanView } from './views/PlanView'
import { ReviewView } from './views/ReviewView'
import { HabitsView } from './views/HabitsView'
import { ProjectView } from './views/ProjectView'
import { WelcomeView } from './views/WelcomeView'
import { currentUserQueryOptions, useProjects } from './api/hooks'
import { createQueryClient } from './queryClient'

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
          <Outlet />
        </div>
      </div>
    </div>
  )
}

interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: WelcomeView,
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
  component: Layout,
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

function ProjectRouteComponent() {
  const { projectId } = projectRoute.useParams()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === Number(projectId))
  if (!project) return null
  return <ProjectView project={project} />
}

const projectRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/projects/$projectId',
  component: ProjectRouteComponent,
})

const routeTree = rootRoute.addChildren([
  welcomeRoute,
  authedRoute.addChildren([todayRoute, planRoute, reviewRoute, habitsRoute, projectRoute]),
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

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
