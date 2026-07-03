import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { Sidebar } from './components/Sidebar'
import { TodayView } from './views/TodayView'
import { PlanView } from './views/PlanView'
import { ReviewView } from './views/ReviewView'
import { HabitsView } from './views/HabitsView'
import { ProjectView } from './views/ProjectView'
import { useProjects } from './api/hooks'

function Layout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="max-w-[880px] flex-1 overflow-y-auto px-12 py-9">
        <Outlet />
      </div>
    </div>
  )
}

const rootRoute = createRootRoute({ component: Layout })

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TodayView,
})

const planRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plan',
  component: PlanView,
})

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: ReviewView,
})

const habitsRoute = createRoute({
  getParentRoute: () => rootRoute,
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
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectRouteComponent,
})

const routeTree = rootRoute.addChildren([
  todayRoute,
  planRoute,
  reviewRoute,
  habitsRoute,
  projectRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
