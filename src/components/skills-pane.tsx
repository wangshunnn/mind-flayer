import { revealItemInDir } from "@tauri-apps/plugin-opener"
import {
  ChevronDownIcon,
  InfoIcon,
  MoreHorizontalIcon,
  MoveUpRightIcon,
  RefreshCwIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MessageResponse } from "@/components/ai-elements/message"
import { TopFloatingHeader } from "@/components/top-floating-header"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  deleteSkill,
  getSkillDetail,
  listSkills,
  type SkillDetail,
  type SkillListItem
} from "@/lib/sidecar-client"
import { cn } from "@/lib/utils"

export function splitSkillsBySource(skills: SkillListItem[]) {
  return {
    bundledSkills: skills.filter(skill => skill.source === "bundled"),
    userSkills: skills.filter(skill => skill.source === "user")
  }
}

const SKILL_CARD_SKELETON_IDS = ["skill-skeleton-1", "skill-skeleton-2"] as const
const SKILLS_PANE_MAX_WIDTH_PX = 960
const SKILLS_HEADER_CONTENT_CLASS = "w-[min(960px,calc(100vw-13rem))]"
const SKILL_CARD_GRID_CLASS = "grid justify-items-center gap-3 md:grid-cols-2"
const SKILL_CARD_WIDTH_CLASS = "w-full max-w-[28rem] md:max-w-none"
const SKILL_DETAIL_DIALOG_CLASS =
  "w-[min(56rem,calc(100vw-4rem))] max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] gap-4 overflow-hidden py-4 px-6"

interface SkillsPaneProps {
  disabledSkillIds: string[]
  setDisabledSkillIds: (skillIds: string[]) => Promise<void>
}

interface SkillsSectionProps {
  title: string
  description: string
  count: number
  open: boolean
  onOpenChange: (nextOpen: boolean) => void
  children: ReactNode
}

function SkillsSection({
  title,
  description,
  count,
  open,
  onOpenChange,
  children
}: SkillsSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between gap-4 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-w-0 items-center gap-2 text-left">
              <ChevronDownIcon
                className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
              />
              <span className="truncate text-sm font-medium">{title}</span>
            </button>
          </CollapsibleTrigger>

          <Tooltip disableHoverableContent={true}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-5 rounded-full text-muted-foreground"
                aria-label={description}
              >
                <InfoIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-xs leading-5">
              <p>{description}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="shrink-0 text-xs text-muted-foreground">{count}</div>
      </div>

      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

interface SkillCardProps {
  skill: SkillListItem
  enabled: boolean
  uninstallLabel: string
  onToggleEnabled: (skillId: string, enabled: boolean) => void
  onOpenDetail: (skillId: string) => void
  onRequestUninstall: (skill: SkillListItem) => void
}

function SkillCard({
  skill,
  enabled,
  uninstallLabel,
  onToggleEnabled,
  onOpenDetail,
  onRequestUninstall
}: SkillCardProps) {
  return (
    <div
      className={cn(
        "group relative w-full rounded-xl border bg-background transition-colors",
        SKILL_CARD_WIDTH_CLASS,
        "hover:bg-muted/20 hover:border-border/80"
      )}
    >
      <button
        type="button"
        aria-label={skill.name}
        className={cn(
          "absolute inset-0 rounded-xl",
          "focus-visible:outline-hidden focus-visible:ring-2",
          "focus-visible:ring-ring focus-visible:ring-inset"
        )}
        onClick={() => onOpenDetail(skill.id)}
      />

      <div className="pointer-events-none relative z-10 flex items-start gap-3 px-4 py-4">
        <div className="mt-0.5 rounded-lg bg-muted p-2 text-muted-foreground">
          <WandSparklesIcon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{skill.name}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {skill.description}
              </p>
            </div>

            <div className="pointer-events-auto relative z-20 flex shrink-0 items-center gap-2">
              {skill.canUninstall && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={skill.name}>
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onRequestUninstall(skill)}
                    >
                      <Trash2Icon className="size-4" />
                      <span>{uninstallLabel}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Switch
                checked={enabled}
                onCheckedChange={checked => onToggleEnabled(skill.id, checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkillsPane({ disabledSkillIds, setDisabledSkillIds }: SkillsPaneProps) {
  const { t } = useTranslation("common")
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<SkillDetail | null>(null)
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [pendingUninstallSkill, setPendingUninstallSkill] = useState<SkillListItem | null>(null)
  const [isUninstalling, setIsUninstalling] = useState(false)
  const [isBundledSectionOpen, setIsBundledSectionOpen] = useState(true)
  const [isUserSectionOpen, setIsUserSectionOpen] = useState(false)
  const [hasUserSectionBeenToggled, setHasUserSectionBeenToggled] = useState(false)

  const { bundledSkills, userSkills } = useMemo(() => splitSkillsBySource(skills), [skills])

  const loadSkills = useCallback(
    async (manualRefresh = false) => {
      if (manualRefresh) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }

      try {
        const nextSkills = await listSkills()
        setSkills(nextSkills)
        setErrorMessage(null)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("skills.loadError"))
      } finally {
        if (manualRefresh) {
          setIsRefreshing(false)
        } else {
          setIsLoading(false)
        }
      }
    },
    [t]
  )

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  useEffect(() => {
    if (hasUserSectionBeenToggled) {
      return
    }

    setIsUserSectionOpen(userSkills.length > 0)
  }, [hasUserSectionBeenToggled, userSkills.length])

  useEffect(() => {
    if (!selectedSkillId) {
      setSelectedSkillDetail(null)
      setDetailErrorMessage(null)
      setIsLoadingDetail(false)
      return
    }

    let cancelled = false
    setIsLoadingDetail(true)
    setSelectedSkillDetail(null)
    setDetailErrorMessage(null)

    const loadSkillDetail = async () => {
      try {
        const detail = await getSkillDetail(selectedSkillId)
        if (!cancelled) {
          setSelectedSkillDetail(detail)
        }
      } catch (error) {
        if (!cancelled) {
          setDetailErrorMessage(
            error instanceof Error ? error.message : t("skills.detailLoadError")
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false)
        }
      }
    }

    void loadSkillDetail()

    return () => {
      cancelled = true
    }
  }, [selectedSkillId, t])

  const handleToggleEnabled = useCallback(
    async (skillId: string, enabled: boolean) => {
      const nextDisabledSkillIds = enabled
        ? disabledSkillIds.filter(id => id !== skillId)
        : Array.from(new Set([...disabledSkillIds, skillId]))

      await setDisabledSkillIds(nextDisabledSkillIds)
    },
    [disabledSkillIds, setDisabledSkillIds]
  )

  const handleConfirmUninstall = useCallback(async () => {
    if (!pendingUninstallSkill) {
      return
    }

    setIsUninstalling(true)
    try {
      await deleteSkill(pendingUninstallSkill.id)
      if (disabledSkillIds.includes(pendingUninstallSkill.id)) {
        await setDisabledSkillIds(disabledSkillIds.filter(id => id !== pendingUninstallSkill.id))
      }

      toast.success(t("skills.uninstallSuccess", { skillName: pendingUninstallSkill.name }))
      setPendingUninstallSkill(null)
      setSelectedSkillId(currentId => (currentId === pendingUninstallSkill.id ? null : currentId))
      setSelectedSkillDetail(currentDetail =>
        currentDetail?.id === pendingUninstallSkill.id ? null : currentDetail
      )
      await loadSkills(true)
    } catch (error) {
      toast.error(t("toast.error"), {
        description: error instanceof Error ? error.message : t("skills.uninstallError")
      })
    } finally {
      setIsUninstalling(false)
    }
  }, [disabledSkillIds, loadSkills, pendingUninstallSkill, setDisabledSkillIds, t])

  const handleRevealSkillDirectory = useCallback(async () => {
    if (!selectedSkillDetail?.filePath) {
      return
    }

    try {
      await revealItemInDir(selectedSkillDetail.filePath)
    } catch (error) {
      toast.error(t("toast.error"), {
        description: error instanceof Error ? error.message : t("skills.openFolderError")
      })
    }
  }, [selectedSkillDetail?.filePath, t])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopFloatingHeader
        contentClassName={SKILLS_HEADER_CONTENT_CLASS}
        rightSlotClassName="right-3"
        rightSlot={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadSkills(true)}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCwIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />
            {t("skills.refresh")}
          </Button>
        }
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{t("skills.title")}</p>
        </div>
      </TopFloatingHeader>

      {errorMessage && (
        <div className="border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div
          className="mx-auto flex w-full flex-col gap-5 px-6 py-5"
          style={{ maxWidth: `${SKILLS_PANE_MAX_WIDTH_PX}px` }}
        >
          <SkillsSection
            title={t("skills.bundledSectionTitle")}
            description={t("skills.bundledSectionDescription")}
            count={bundledSkills.length}
            open={isBundledSectionOpen}
            onOpenChange={setIsBundledSectionOpen}
          >
            {isLoading ? (
              <div className={SKILL_CARD_GRID_CLASS}>
                {SKILL_CARD_SKELETON_IDS.map(skeletonId => (
                  <div
                    key={skeletonId}
                    className={cn(
                      "rounded-xl border bg-background px-4 py-4",
                      SKILL_CARD_WIDTH_CLASS
                    )}
                  >
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-3 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : bundledSkills.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                {t("skills.emptyBundled")}
              </div>
            ) : (
              <div className={SKILL_CARD_GRID_CLASS}>
                {bundledSkills.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    enabled={!disabledSkillIds.includes(skill.id)}
                    uninstallLabel={t("skills.uninstall")}
                    onToggleEnabled={handleToggleEnabled}
                    onOpenDetail={setSelectedSkillId}
                    onRequestUninstall={setPendingUninstallSkill}
                  />
                ))}
              </div>
            )}
          </SkillsSection>

          <SkillsSection
            title={t("skills.userSectionTitle")}
            description={t("skills.userSectionDescription")}
            count={userSkills.length}
            open={isUserSectionOpen}
            onOpenChange={nextOpen => {
              setHasUserSectionBeenToggled(true)
              setIsUserSectionOpen(nextOpen)
            }}
          >
            {isLoading ? (
              <div className="rounded-xl border bg-background px-4 py-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="mt-3 h-3 w-full" />
              </div>
            ) : userSkills.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                {t("skills.emptyUser")}
              </div>
            ) : (
              <div className={SKILL_CARD_GRID_CLASS}>
                {userSkills.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    enabled={!disabledSkillIds.includes(skill.id)}
                    uninstallLabel={t("skills.uninstall")}
                    onToggleEnabled={handleToggleEnabled}
                    onOpenDetail={setSelectedSkillId}
                    onRequestUninstall={setPendingUninstallSkill}
                  />
                ))}
              </div>
            )}
          </SkillsSection>
        </div>
      </ScrollArea>

      <Dialog
        open={selectedSkillId !== null}
        onOpenChange={open => !open && setSelectedSkillId(null)}
      >
        <DialogContent showCloseButton={false} className={SKILL_DETAIL_DIALOG_CLASS}>
          <div className="space-y-0">
            <div className="flex items-center justify-between gap-4">
              <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                <WandSparklesIcon className="size-4" />
              </div>

              <DialogClose
                className={cn(
                  "rounded-xs opacity-70 transition-opacity hover:opacity-100",
                  "data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
                  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                )}
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>

            <div className="flex items-start justify-between gap-4 pt-4 pb-2">
              <DialogHeader className="min-w-0 flex-1 text-left">
                <DialogTitle className="text-2xl">
                  {selectedSkillDetail?.name ?? t("skills.title")}
                </DialogTitle>
              </DialogHeader>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground text-xs"
                onClick={() => void handleRevealSkillDirectory()}
                disabled={!selectedSkillDetail?.filePath}
              >
                {t("skills.openFolder")}
                <MoveUpRightIcon className="size-3" />
              </Button>
            </div>

            <DialogDescription className="text-left text-sm">
              {selectedSkillDetail?.description ?? ""}
            </DialogDescription>
          </div>

          <div className="h-[55vh] w-full min-w-0 max-w-full max-h-144 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border bg-muted/10">
            <div className="w-full min-w-0 max-w-full px-4 pt-2 pb-4">
              {isLoadingDetail ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : detailErrorMessage ? (
                <p className="text-sm text-destructive">{detailErrorMessage}</p>
              ) : (
                <MessageResponse className="skills-pane-markdown">
                  {selectedSkillDetail?.bodyMarkdown ?? ""}
                </MessageResponse>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingUninstallSkill !== null}
        onOpenChange={open => !open && !isUninstalling && setPendingUninstallSkill(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("skills.uninstallTitle")}</DialogTitle>
            <DialogDescription>
              {t("skills.uninstallDescription", { skillName: pendingUninstallSkill?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingUninstallSkill(null)}
              disabled={isUninstalling}
            >
              {t("skills.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmUninstall()}
              disabled={isUninstalling}
            >
              {isUninstalling ? t("skills.uninstalling") : t("skills.uninstall")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
