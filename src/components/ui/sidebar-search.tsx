import { DialogClose } from "@radix-ui/react-dialog"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SidebarGroup, SidebarGroupContent, SidebarMenuButton } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function SearchChat() {
  return (
    <Dialog>
      <SidebarGroup>
        <SidebarGroupContent className="flex items-center gap-2">
          <DialogTrigger asChild className="flex-1">
            <div>
              <Label htmlFor="search" className="sr-only">
                Search
              </Label>
              <SidebarMenuButton
                className={cn(
                  "cursor-pointer bg-sidebar-search hover:bg-sidebar-search-hover w-full",
                  "text-sidebar-search-foreground hover:text-sidebar-search-foreground",
                  "border-[0.5px] border-sidebar-search-border"
                )}
              >
                <Search />
                <span>Search</span>
              </SidebarMenuButton>
            </div>
          </DialogTrigger>
        </SidebarGroupContent>
      </SidebarGroup>

      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>Search Chat</DialogTitle>
          <DialogDescription>This feature is coming soon. Stay tuned!</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
