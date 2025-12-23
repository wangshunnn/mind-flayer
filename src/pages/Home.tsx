import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { DarkModeToggle, NewChatTrigger } from "../components/nav-top"

export default function Page() {
  return (
    <SidebarProvider>
      {/* Left sidebar */}
      <AppSidebar />

      {/* Top drag region */}
      <div data-tauri-drag-region className="z-50 fixed top-0 left-0 right-0 h-11"></div>

      {/* Top buttons */}
      <div className="z-100 fixed top-4.25 left-25 flex items-center justify-center pointer-events-auto gap-1.25">
        <SidebarTrigger />
        <NewChatTrigger />
        <DarkModeToggle />
      </div>

      {/* Main content area */}
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">{/* LLM Model */}</div>
        </header>
      </SidebarInset>
    </SidebarProvider>
  )
}
