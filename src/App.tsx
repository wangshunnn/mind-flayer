import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { ThemeProvider } from "@/components/theme-provider"
import About from "@/pages/About"
import Home from "@/pages/Home"

import "@/styles/App.css"

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: About
})

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

const router = createRouter({ routeTree })

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}

export default App
