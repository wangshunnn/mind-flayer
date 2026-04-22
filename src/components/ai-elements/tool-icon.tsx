import {
  BookOpenTextIcon,
  BookSearchIcon,
  BotIcon,
  GlobeIcon,
  LibraryBigIcon,
  Pencil,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon
} from "lucide-react"

export function getToolIcon(toolName: string, className: string) {
  switch (toolName.trim().toLowerCase()) {
    case "websearch":
      return <GlobeIcon className={className} />
    case "bashexecution":
      return <TerminalIcon className={className} />
    case "agentsessionstart":
    case "agentsessionread":
    case "agentsessionstop":
      return <BotIcon className={className} />
    case "read":
      return <BookOpenTextIcon className={className} />
    case "skillread":
      return <LibraryBigIcon className={className} />
    case "appendworkspacesection":
    case "replaceworkspacesection":
    case "appenddailymemory":
      return <Pencil className={className} />
    case "deleteworkspacefile":
      return <Trash2Icon className={className} />
    case "memorysearch":
    case "memoryget":
      return <BookSearchIcon className={className} />
    default:
      return <WrenchIcon className={className} />
  }
}
