import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { useLanguage } from "@/hooks/use-language"
import { initDatabase } from "@/lib/database"
import i18n from "@/lib/i18n"
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
  // Initialize language detection
  useLanguage()

  useEffect(() => {
    // Initialize database on app mount
    initDatabase().catch(err => {
      console.error("Failed to initialize database:", err)
    })
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
        <Toaster />
      </I18nextProvider>
    </ThemeProvider>
  )
}

export default App
