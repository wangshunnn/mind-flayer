import "i18next"

import type common from "@/locales/en/common.json"
import type settings from "@/locales/en/settings.json"
import type chat from "@/locales/en/chat.json"
import type tools from "@/locales/en/tools.json"
import type actions from "@/locales/en/actions.json"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common"
    resources: {
      common: typeof common
      settings: typeof settings
      chat: typeof chat
      tools: typeof tools
      actions: typeof actions
    }
  }
}
