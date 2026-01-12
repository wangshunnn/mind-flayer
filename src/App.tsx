import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { useEffect } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { initDatabase } from "@/lib/database"
import Home from "@/pages/Home"
import Settings from "@/pages/Settings"

import "@/styles/App.css"

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: Settings
})

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute])

const router = createRouter({ routeTree })

function App() {
  useEffect(() => {
    // Initialize database on app mount
    initDatabase().catch(err => {
      console.error("Failed to initialize database:", err)
    })
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}

export default App
