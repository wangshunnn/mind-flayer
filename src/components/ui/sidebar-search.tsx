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
      <DialogTrigger asChild>
        <SidebarGroup>
          <SidebarGroupContent>
            <Label htmlFor="search" className="sr-only">
              Search
            </Label>
            <SidebarMenuButton
              className={cn(
                "cursor-pointer bg-sidebar-search hover:bg-sidebar-search-hover",
                "text-sidebar-search-foreground hover:text-sidebar-search-foreground",
                "border-[0.5px] border-black/8"
              )}
            >
              <Search />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarGroupContent>
        </SidebarGroup>
      </DialogTrigger>

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
