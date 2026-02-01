# Claude Instructions for Mind Flayer

> **📝 Document Maintenance**: Keep in sync with `.github/copilot-instructions.md`. Update with: "Update the AI instruction docs."

## Core Principles

### Language & Communication
- **All code, comments, and commits MUST be in English**
- Use conventional commits format: `type(scope): description`
- Keep responses concise but complete
- Provide working solutions, not suggestions

## Application Architecture

### Overview
Mind Flayer is a Tauri-based desktop AI assistant with:
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust (Tauri) + Node.js Sidecar
- **Database**: SQLite (Tauri Plugin SQL)
- **Routing**: TanStack Router (2 routes: `/`, `/settings`)

### Window Architecture
**Dual Window System**:
- Main Window (`/`): Chat interface with sidebar
- Settings Window (`/settings`): Configuration with 6 tabs
- Communication: Tauri events (`setting-changed`, `provider-config-changed`)

### Core Components

**Main Layout** (`src/pages/Home.tsx`):
```
SidebarProvider
  ├── AppSidebar (chats list, nav)
  ├── AppChat (message area, input)
  └── Floating: SidebarTrigger, NewChatTrigger
```

**AppSidebar** ([src/components/app-sidebar.tsx](src/components/app-sidebar.tsx)):
- Chat history list (NavChats)
- Navigation menu (NavMain)
- User profile (NavUser)
- Manages active chat selection

**AppChat** ([src/components/app-chat.tsx](src/components/app-chat.tsx)):
- Message display area with streaming
- AI SDK (`useChat` hook) integration
- Tool invocations (web search, deep think)
- Model selector (SelectModel)
- File attachments

### Data Flow

**Chat Storage** (`useChatStorage` hook):
```typescript
useChatStorage()
  ├── loadChats() - Fetch from SQLite
  ├── createChat() - Insert new chat
  ├── updateChat() - Update title/timestamp
  ├── deleteChat() - Remove chat + messages
  ├── saveMessages() - Persist AI messages
  └── loadMessages() - Restore chat history
```

**AI Streaming Flow**:
```
User Input → AppChat → POST /api/chat (sidecar)
  → Provider API → Stream Response → UI Update
  → Save to SQLite → Update Chat List
```

### Sidecar Process

**Architecture** ([sidecar/src/index.ts](sidecar/src/index.ts)):
- **Framework**: Hono (Node.js HTTP server)
- **Port**: 3737
- **Routes**: `/api/chat` (streaming), `/health`
- **Communication**: stdin (config updates from Rust)

**Request Flow**:
```
Frontend → http://localhost:3737/api/chat
  → Provider Registry → MiniMax/OpenAI/Anthropic
  → Stream Handler → SSE Response
```

**Config Updates**:
```
Rust Keychain → stdin JSON → providerService.updateConfigs()
  → Auto-refresh tool configs
```

**Key Services**:
- `providerService`: Manage API credentials
- `toolService`: Web search, deep think tools
- `streamHandler`: Handle SSE streaming

### Type System

**Chat Types** ([src/types/chat.ts](src/types/chat.ts)):
- `Chat`: { id, title, created_at, updated_at }
- `StoredMessage`: DB format (JSON content)
- `UIMessage`: AI SDK format (for display)

**Settings Types** ([src/types/settings.ts](src/types/settings.ts)):
- `AppSettings`: All app configuration
- `ShortcutConfig`: Keyboard shortcut metadata

## Code Style

### TypeScript/React
- Use TypeScript strict mode, avoid `any`
- Functional components with hooks, named exports
- Import order: React → third-party → local → utilities → types

### Styling & State
- Tailwind CSS + Radix UI design system
- Use `cn()` for conditional classes, support dark mode
- `useState` for simple state, `useReducer` for complex
- Keep state local, use context sparingly

### File Naming
- Components: PascalCase (`AppChat.tsx`)
- Hooks/utilities: kebab-case (`use-compact.ts`)

### Rust/Tauri
- Follow `cargo fmt`, doc comments for public APIs
- Use `Result` types, async/await for I/O

## Project Architecture

### Settings System
`src/hooks/use-settings-store.ts` (Tauri Plugin Store)

**Hooks**:
- `useSetting(key)` - Single setting: `const [theme, setTheme] = useSetting("theme")`
- `useSettings()` - All settings
- `getSetting/setSetting` - Outside React

**Features**: Auto-save to `settings.json`, deep merge, cross-window sync via `setting-changed` event

**Schema** (`src/types/settings.ts`): theme, language, selectedModelApiId, enabledProviders, webSearchEnabled, webSearchMode, deepThinkEnabled, autoLaunch, shortcuts

### Keyboard Shortcuts
`src/types/settings.ts` | `src/lib/shortcut-*.ts` | `src-tauri/src/shortcuts.rs`

**Actions**: Global: `TOGGLE_WINDOW` (Shift+Alt+W) | Local: `TOGGLE_SIDEBAR`, `OPEN_SETTINGS`, `SEARCH_HISTORY`, `SEND_MESSAGE`, `NEW_LINE`, `NEW_CHAT`

**Hooks**: `useShortcutConfig()`, `useShortcut(action)`, `useShortcutDisplay(action)`  
**Utilities**: `formatShortcutForDisplay(key)`, `matchesShortcut(event, key)`  
**Global shortcuts**: Registered in Rust via `tauri-plugin-global-shortcut`

### Keychain & Secure Storage
`src-tauri/src/keychain.rs` - AES-256-GCM encryption, machine-specific keys

**Storage**: `provider_configs.dat` (Base64-encoded encrypted JSON)  
**Commands**: `save_provider_config`, `get_provider_config`, `delete_provider_config`, `list_all_providers`  
**Frontend**: `useProviderConfig()` hook  
**Security**: ⚠️ Never store API keys in plain text or localStorage

### Settings Page
`src/pages/Settings/index.tsx` - Six sections: Providers, Web Search, General, Keyboard, Advanced, About

**Features**: Provider config with API keys, theme/language, shortcuts display, tools configuration  
**Window Management**: `openSettingsWindow(SettingsSection)`  
**Sync**: Cross-window via `provider-config-changed` events

### Database & Chat Storage
`src/lib/database.ts` - Tauri Plugin SQL (SQLite)

**API**: `getDatabase()` (preferred), `initDatabase()`  
**Tables**: `chats`, `messages` (schema in `src-tauri/migrations/`)  
**Security**: ⚠️ Always use parameterized queries
```typescript
const db = await getDatabase()
const chats = await db.select("SELECT * FROM chats WHERE id = ?", [id])
```

### Internationalization (i18n)
`src/lib/i18n.ts` - i18next + react-i18next

**Languages**: English (`en`), Simplified Chinese (`zh-CN`), System auto-detect  
**Hook**: `useLanguage()` - System detection via Tauri OS API  
**Namespaces**: common, settings, chat, tools, actions

**Usage**:
```typescript
const { t } = useTranslation("settings")
<Label>{t("form.apiKey")}</Label>
// With interpolation: t("filesAttached", { count: 5 })
```

**Guidelines**:
- ✅ Always use `t()` for user-facing strings
- ✅ Semantic keys: `chat.sendMessage` not `btn_1`
- ✅ Update both `en` and `zh-CN` files
- ✅ Run `pnpm dlx tsx scripts/check-i18n.ts` before commit
- ❌ Never hardcode strings or mix languages

### AI & Tauri Integration
- SDK: `@ai-sdk/react` for streaming responses
- Providers: MiniMax, OpenAI, Anthropic (via Settings)
- Sidecar: Node.js TypeScript proxy (`sidecar/src/index.ts`)
- Events: `setting-changed`, `provider-config-changed`, `settings-change-tab`
- Minimize IPC calls, handle cross-platform differences

### Provider Logos
`src/components/ui/provider-logo.tsx`  
Usage: `<ProviderLogo providerId="minimax" className="size-5" />`  
Supported: MiniMax, OpenAI, Anthropic, Gemini, Kimi, Zhipu (custom SVGs in `src/components/icons/`)

## Common Patterns

**Settings**:
```typescript
const [theme, setTheme] = useSetting("theme")
await setTheme("dark") // Auto-saves and syncs
```

**Shortcuts**:
```typescript
const shortcut = useShortcut(ShortcutAction.SEND_MESSAGE)
if (matchesShortcut(e, shortcut.key) && shortcut.enabled) {
  e.preventDefault()
  handleSubmit()
}
```

**Provider Config**:
```typescript
const { saveConfig, getConfig, deleteConfig } = useProviderConfig()
await saveConfig("minimax", apiKey, baseUrl)
```

**Translations**:
```typescript
const { t } = useTranslation("settings")
<Button>{t("providers.save")}</Button>
```

## Best Practices

**DO**:
- ✅ Use TypeScript strict mode
- ✅ Use `useSetting` for all settings
- ✅ Use parameterized SQL queries
- ✅ Use `t()` for all user-facing text
- ✅ Check `enabled` flag for shortcuts
- ✅ Update both EN and ZH translations
- ✅ Emit events for cross-window sync

**DON'T**:
- ❌ Store API keys in plain text
- ❌ Use `any` without justification
- ❌ Hardcode user-facing strings
- ❌ Use string interpolation in SQL
- ❌ Mutate settings directly
- ❌ Mix languages in translation files

---

**Remember**: Write production-ready code, handle edge cases, prioritize user experience.
