import { revealItemInDir } from "@tauri-apps/plugin-opener"
import {
  BadgeInfoIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SquareArrowOutUpRightIcon,
  Trash2Icon,
  XIcon
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MessageResponse } from "@/components/ai-elements/message"
import { TopFloatingHeader } from "@/components/top-floating-header"
import { Button } from "@/components/ui/button"
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

const SKILL_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
})

function sortSkillsByName(skills: SkillListItem[]) {
  return [...skills].sort((left, right) => {
    const byName = SKILL_NAME_COLLATOR.compare(left.name, right.name)
    if (byName !== 0) {
      return byName
    }

    return left.id.localeCompare(right.id)
  })
}

export function splitSkillsBySource(skills: SkillListItem[]) {
  return {
    bundledSkills: sortSkillsByName(skills.filter(skill => skill.source === "bundled")),
    userSkills: sortSkillsByName(skills.filter(skill => skill.source === "user"))
  }
}

const SKILL_CARD_SKELETON_IDS = ["skill-skeleton-1", "skill-skeleton-2"] as const
const SKILLS_PANE_MAX_WIDTH_PX = 960
const SKILLS_HEADER_CONTENT_CLASS = "w-[min(960px,calc(100vw-13rem))]"
const SKILL_CARD_GRID_CLASS = "grid justify-items-center gap-3 md:grid-cols-2"
const SKILL_CARD_WIDTH_CLASS = "w-full max-w-[28rem] md:max-w-none"
const SKILL_DETAIL_DIALOG_CLASS =
  "flex h-[min(720px,calc(100vh-4rem))] w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] max-w-[calc(100vw-4rem)] flex-col gap-4 overflow-hidden px-4 py-4 sm:w-[580px] sm:!max-w-[580px]"

interface SkillsPaneProps {
  disabledSkillIds: string[]
  setDisabledSkillIds: (skillIds: string[]) => Promise<void>
}

interface SkillsSectionProps {
  title: string
  description: string
  children: ReactNode
}

interface SkillIconProps {
  iconUrl?: string | null
  className?: string
}

function SkillFallbackIcon() {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      data-skill-icon-fallback
      className="size-full"
    >
      <rect width="40" height="40" rx="10" fill="#FFF7ED" />
      <path
        d="M22.2 7.8c.3 0 .5.2.6.5l1.6 5.1a.8.8 0 0 0 .5.5l5.1 1.6c.3 0 .5.3.5.6 0 .2-.2.5-.5.5l-5.1 1.6a.8.8 0 0 0-.5.5l-1.6 5.1c0 .3-.3.5-.6.5-.2 0-.5-.2-.5-.5l-1.6-5.1a.8.8 0 0 0-.5-.5l-5.1-1.6c-.3 0-.5-.3-.5-.5 0-.3.2-.5.5-.6l5.1-1.6a.8.8 0 0 0 .5-.5l1.6-5.1c0-.3.3-.5.5-.5Z"
        fill="#F97316"
      />
      <path
        d="M8 28.4c3.8-3 8-4.5 12.8-4.5 4.5 0 8.3 1.2 11.2 3.5V30H8v-1.6Z"
        fill="#7DD3FC"
        opacity="0.85"
      />
      <circle cx="29.5" cy="10.5" r="3.5" fill="#FCD34D" />
      <circle cx="11.5" cy="11.5" r="2" fill="#FDBA74" />
    </svg>
  )
}

function SkillIcon({ iconUrl, className }: SkillIconProps) {
  return (
    <div
      className={cn(
        "size-10 overflow-hidden rounded-md bg-muted/70 text-muted-foreground",
        className
      )}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          aria-hidden="true"
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <SkillFallbackIcon />
      )}
    </div>
  )
}

function SkillsSection({ title, description, children }: SkillsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex min-w-0 items-center gap-1.5 py-1 px-3">
        <span className="truncate text-xs font-medium">{title}</span>

        <Tooltip disableHoverableContent={true}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-4 rounded-full text-muted-foreground"
              aria-label={description}
            >
              <BadgeInfoIcon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 text-xs leading-5">
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {children}
    </section>
  )
}

interface SkillCardProps {
  skill: SkillListItem
  enabled: boolean
  uninstallLabel: string
  openDetailsLabel: string
  moreActionsLabel: string
  toggleEnabledLabel: string
  onToggleEnabled: (skillId: string, enabled: boolean) => void
  onOpenDetail: (skillId: string) => void
  onRequestUninstall: (skill: SkillListItem) => void
}

function SkillCard({
  skill,
  enabled,
  uninstallLabel,
  openDetailsLabel,
  moreActionsLabel,
  toggleEnabledLabel,
  onToggleEnabled,
  onOpenDetail,
  onRequestUninstall
}: SkillCardProps) {
  return (
    <div
      className={cn(
        "group relative w-full rounded-2xl transition-colors",
        SKILL_CARD_WIDTH_CLASS,
        "bg-transparent hover:bg-muted/55"
      )}
    >
      <button
        type="button"
        aria-label={openDetailsLabel}
        className={cn(
          "absolute inset-0 rounded-xl",
          "focus-visible:outline-hidden focus-visible:ring-2",
          "focus-visible:ring-ring focus-visible:ring-inset"
        )}
        onClick={() => onOpenDetail(skill.id)}
      />

      <div
        className={cn(
          "pointer-events-none relative z-10 flex items-center gap-3 px-3 py-3 transition-opacity",
          !enabled && "opacity-70"
        )}
      >
        <SkillIcon iconUrl={skill.iconUrl} />

        <div className="min-w-0 flex flex-1 items-center justify-between gap-3">
          <div className="min-w-0 flex-1 font-medium">
            <p className="truncate text-md">{skill.name}</p>
            <p className="line-clamp-1 text-xs leading-5 text-muted-foreground">
              {skill.description}
            </p>
          </div>

          <div className="pointer-events-auto relative z-20 flex shrink-0 items-center gap-2 self-center">
            {skill.canUninstall && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={moreActionsLabel}
                  >
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
              aria-label={toggleEnabledLabel}
              checked={enabled}
              onCheckedChange={checked => onToggleEnabled(skill.id, checked)}
            />
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
  const disabledSkillIdsRef = useRef(disabledSkillIds)
  const toggleQueueRef = useRef<Promise<void>>(Promise.resolve())

  const { bundledSkills, userSkills } = useMemo(() => splitSkillsBySource(skills), [skills])
  const isSelectedSkillDisabled =
    selectedSkillDetail && disabledSkillIds.includes(selectedSkillDetail.id)

  useEffect(() => {
    disabledSkillIdsRef.current = disabledSkillIds
  }, [disabledSkillIds])

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
    (skillId: string, enabled: boolean) => {
      toggleQueueRef.current = toggleQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousDisabledSkillIds = disabledSkillIdsRef.current
          const nextDisabledSkillIds = enabled
            ? previousDisabledSkillIds.filter(id => id !== skillId)
            : Array.from(new Set([...previousDisabledSkillIds, skillId]))

          const hasChanged =
            nextDisabledSkillIds.length !== previousDisabledSkillIds.length ||
            nextDisabledSkillIds.some((id, index) => id !== previousDisabledSkillIds[index])

          if (!hasChanged) {
            return
          }

          disabledSkillIdsRef.current = nextDisabledSkillIds

          try {
            await setDisabledSkillIds(nextDisabledSkillIds)
          } catch (error) {
            disabledSkillIdsRef.current = previousDisabledSkillIds
            try {
              await setDisabledSkillIds(previousDisabledSkillIds)
            } catch {}
            toast.error(t("toast.error"), {
              description: error instanceof Error ? error.message : t("skills.toggleError")
            })
          }
        })
    },
    [setDisabledSkillIds, t]
  )

  const handleConfirmUninstall = useCallback(async () => {
    if (!pendingUninstallSkill) {
      return
    }

    const skillToUninstall = pendingUninstallSkill
    setIsUninstalling(true)

    try {
      await deleteSkill(skillToUninstall.id)
    } catch (error) {
      toast.error(t("toast.error"), {
        description: error instanceof Error ? error.message : t("skills.uninstallError")
      })
      setIsUninstalling(false)
      return
    }

    if (disabledSkillIdsRef.current.includes(skillToUninstall.id)) {
      const nextDisabledSkillIds = disabledSkillIdsRef.current.filter(
        id => id !== skillToUninstall.id
      )
      disabledSkillIdsRef.current = nextDisabledSkillIds

      try {
        await setDisabledSkillIds(nextDisabledSkillIds)
      } catch (error) {
        console.warn(
          `[SkillsPane] Failed to remove deleted skill '${skillToUninstall.id}' from disabled settings: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }

    try {
      toast.success(t("skills.uninstallSuccess", { skillName: skillToUninstall.name }))
      setPendingUninstallSkill(null)
      setSelectedSkillId(currentId => (currentId === skillToUninstall.id ? null : currentId))
      setSelectedSkillDetail(currentDetail =>
        currentDetail?.id === skillToUninstall.id ? null : currentDetail
      )
      await loadSkills(true)
    } finally {
      setIsUninstalling(false)
    }
  }, [loadSkills, pendingUninstallSkill, setDisabledSkillIds, t])

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
          className="mx-auto flex w-full flex-col gap-5 px-5 py-5"
          style={{ maxWidth: `${SKILLS_PANE_MAX_WIDTH_PX}px` }}
        >
          <SkillsSection
            title={t("skills.bundledSectionTitle")}
            description={t("skills.bundledSectionDescription")}
          >
            {isLoading ? (
              <div className={SKILL_CARD_GRID_CLASS}>
                {SKILL_CARD_SKELETON_IDS.map(skeletonId => (
                  <div
                    key={skeletonId}
                    className={cn("rounded-2xl bg-muted/30 px-3 py-3", SKILL_CARD_WIDTH_CLASS)}
                  >
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-3 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : bundledSkills.length === 0 ? (
              <div className="bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
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
                    openDetailsLabel={t("skills.openDetails", { name: skill.name })}
                    moreActionsLabel={t("skills.moreActions", { name: skill.name })}
                    toggleEnabledLabel={t("skills.enableDisable", { name: skill.name })}
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
          >
            {isLoading ? (
              <div className="rounded-2xl bg-muted/30 px-3 py-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="mt-3 h-3 w-full" />
              </div>
            ) : userSkills.length === 0 ? (
              <div className="bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
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
                    openDetailsLabel={t("skills.openDetails", { name: skill.name })}
                    moreActionsLabel={t("skills.moreActions", { name: skill.name })}
                    toggleEnabledLabel={t("skills.enableDisable", { name: skill.name })}
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
          <div className="shrink-0 space-y-0">
            <div className="flex items-start justify-between gap-4">
              <SkillIcon
                iconUrl={selectedSkillDetail?.iconUrl}
                className="size-12 rounded-xl bg-muted"
              />

              <DialogClose
                className={cn(
                  "self-start rounded-xs opacity-70 transition-opacity hover:opacity-100",
                  "data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
                  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                )}
              >
                <XIcon />
                <span className="sr-only">{t("dialog.close")}</span>
              </DialogClose>
            </div>

            <div className="flex items-start justify-between gap-4 pt-4 pb-2">
              <DialogHeader className="min-w-0 flex-1 text-left">
                <div className="flex min-w-0 items-center gap-2">
                  <DialogTitle className="truncate text-2xl">
                    {selectedSkillDetail?.name ?? t("skills.title")}
                  </DialogTitle>
                  {isSelectedSkillDisabled && (
                    <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t("skills.disabledBadge")}
                    </span>
                  )}
                </div>
              </DialogHeader>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground text-xs gap-1"
                onClick={() => void handleRevealSkillDirectory()}
                disabled={!selectedSkillDetail?.filePath}
              >
                {t("skills.openFolder")}
                <SquareArrowOutUpRightIcon className="size-3" />
              </Button>
            </div>

            <DialogDescription className="text-left text-sm font-medium">
              {selectedSkillDetail?.description ?? ""}
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border bg-muted/10">
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
