import { useSyncExternalStore } from "react"
import type { ObservableValue } from "@/lib/chat-render-store"

export function useObservableValue<T>(source: ObservableValue<T>): T {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
}
