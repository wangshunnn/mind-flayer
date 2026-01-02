import { AppChat } from "@/components/app-chat"
import { AppSidebar } from "@/components/app-sidebar"
import { NewChatTrigger } from "@/components/nav-top"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function Page() {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      {/* Left sidebar */}
      <AppSidebar />

      {/* Top drag region */}
      <div data-tauri-drag-region className="z-50 fixed top-0 left-0 right-0 h-14.5"></div>

      {/* Top buttons */}
      <div className="z-50 fixed top-4.25 left-24 flex items-center justify-center pointer-events-auto gap-1">
        <SidebarTrigger />
        <NewChatTrigger />
      </div>

      {/* Main content area */}
      <SidebarInset className="overflow-hidden">
        <AppChat />
      </SidebarInset>
    </SidebarProvider>
  )
}
