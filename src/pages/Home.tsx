import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function Page() {
  return (
    <SidebarProvider>
      {/* Left sidebar */}
      <AppSidebar />

      {/* Top drag region */}
      <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-11 z-50">
        <div className="fixed top-4.25 left-24 w-10 h-7.5 flex items-center justify-center">
          <SidebarTrigger className="pointer-events-auto" />
        </div>
      </div>

      {/* Main content area */}
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">{/* LLM Model */}</div>
        </header>
        {/* <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="bg-muted/50 min-h-screen flex-1 rounded-xl md:min-h-min" />
        </div> */}
      </SidebarInset>
    </SidebarProvider>
  )
}
