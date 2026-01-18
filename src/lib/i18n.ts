import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import actionsEn from "@/locales/en/actions.json"
import chatEn from "@/locales/en/chat.json"
// Import translation files
import commonEn from "@/locales/en/common.json"
import settingsEn from "@/locales/en/settings.json"
import toolsEn from "@/locales/en/tools.json"
import actionsZh from "@/locales/zh-CN/actions.json"
import chatZh from "@/locales/zh-CN/chat.json"
import commonZh from "@/locales/zh-CN/common.json"
import settingsZh from "@/locales/zh-CN/settings.json"
import toolsZh from "@/locales/zh-CN/tools.json"

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      settings: settingsEn,
      chat: chatEn,
      tools: toolsEn,
      actions: actionsEn
    },
    "zh-CN": {
      common: commonZh,
      settings: settingsZh,
      chat: chatZh,
      tools: toolsZh,
      actions: actionsZh
    }
  },
  lng: "en", // Will be overridden by useLanguage hook
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: {
    escapeValue: false // React already escapes values
  }
})

export default i18n
