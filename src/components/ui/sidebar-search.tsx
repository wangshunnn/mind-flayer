import { Search } from "lucide-react"
import { Label } from "@/components/ui/label"
import { SidebarGroup, SidebarGroupContent, SidebarMenuButton } from "@/components/ui/sidebar"

export function SearchChat({ ...props }: React.ComponentProps<"form">) {
  return (
    <form {...props}>
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <SidebarMenuButton className="opacity-60 bg-sidebar-search hover:bg-[#e0e0e0] cursor-pointer">
            <Search />
            <span>Search</span>
          </SidebarMenuButton>
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  )
}
