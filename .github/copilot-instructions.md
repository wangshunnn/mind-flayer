# GitHub Copilot Instructions for Mind Flayer

> **📝 Document Maintenance**: This file should be kept in sync with `.claude/CLAUDE.md`. When significant architecture changes occur, both documents must be updated. Trigger update with: "Update the AI instruction docs."

## Code Style and Standards

### Language Requirements
- **All code comments MUST be written in English**
- Use clear, concise English for variable names, function names, and documentation
- Commit messages should follow conventional commits specification in English

### TypeScript/React Guidelines
- Use TypeScript strict mode features
- Prefer functional components with hooks over class components
- Use `const` for component declarations
- Implement proper TypeScript types; avoid `any` when possible
- Use arrow functions for component definitions
- Follow React 19 best practices

### Code Structure
- Keep components small and focused (single responsibility)
- Extract reusable logic into custom hooks
- Use named exports for components
- Place types/interfaces close to where they're used
- Organize imports: React → third-party → local components → utilities → types

### Styling
- Use Tailwind CSS utility classes
- Follow the existing design system (Radix UI + Tailwind)
- Use `clsx` or `cn` utility for conditional classes
- Keep component-specific styles in the component file

### State Management
- Use React hooks for local state
- Prefer `useReducer` for complex state logic
- Keep state as local as possible
- Use context sparingly; prefer prop drilling for shallow hierarchies

### File Naming
- React components: PascalCase (e.g., `AppChat.tsx`)
- Utilities and hooks: kebab-case (e.g., `use-compact.ts`)
- Types: PascalCase with `.types.ts` suffix if in separate file

### Error Handling
- Always handle async operations with try-catch
- Provide meaningful error messages
- Use TypeScript's strict null checks

### Testing
- Write unit tests for utilities and hooks
- Use descriptive test names in English
- Follow AAA pattern (Arrange, Act, Assert)

### Rust/Tauri Guidelines (Backend)
- Follow Rust standard formatting (use `cargo fmt`)
- Use meaningful variable names
- Add doc comments for public APIs
- Handle errors with Result types
- Use async/await for I/O operations

### Documentation
- Add JSDoc comments for complex functions
- Document component props with TypeScript interfaces
- Include usage examples for reusable components
- Keep README files updated
- Avoid adding excessive comments unless necessary

### Performance
- Memoize expensive computations with `useMemo`
- Optimize re-renders with `useCallback` and `memo`
- Lazy load routes and heavy components
- Avoid unnecessary dependencies in hooks

### Accessibility
- Use semantic HTML elements
- Include proper ARIA labels
- Ensure keyboard navigation support
- Follow Radix UI accessibility guidelines

### Git Workflow
- Follow conventional commits: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore
- Keep commits atomic and focused
- Write meaningful commit messages in English

## Project-Specific Guidelines

### AI Integration
- Use AI SDK (@ai-sdk/react) for AI interactions
- Handle streaming responses properly
- Implement proper loading and error states
- Cache AI responses when appropriate

### Tauri Integration
- Use Tauri API for system interactions
- Handle cross-platform differences (macOS, Windows, Linux)
- Minimize IPC calls for performance
- Properly type Tauri commands

### Sidecar Process
- Handle sidecar lifecycle properly
- Implement graceful shutdown
- Log errors appropriately
- Use middleware pattern for request/response handling

### Keychain & Secure Storage
- **Always store API keys in encrypted local storage**, never in plain text or environment variables
- Use the Rust keychain module (`src-tauri/src/keychain.rs`) for secure storage
- Encryption uses AES-256-GCM with machine-specific keys derived from device name
- Stored data format: Base64-encoded encrypted JSON in `provider_configs.dat`
- Tauri commands for keychain operations:
  - `save_provider_config`: Save API key and optional base URL
  - `get_provider_config`: Retrieve provider configuration
  - `delete_provider_config`: Remove provider configuration
  - `list_all_providers`: List all configured providers
- After keychain updates, configurations are automatically pushed to sidecar via stdin
- Use the `useProviderConfig` hook for all frontend keychain operations

### Settings Page

**Location**: `src/pages/Settings/index.tsx`

**Six Sections**: Providers, Web Search, General, Keyboard, Advanced, About

**Key Features**:
- Provider configuration with API key management (MiniMax, OpenAI, Anthropic, etc.)
- Web search provider setup (Parallel)
- Theme/language/auto-launch settings
- Keyboard shortcuts display (read-only)
- Advanced tools configuration
- Enable/disable toggle for each provider (requires saved API key)
- Cross-window synchronization via `provider-config-changed` events

**Window Management**: Use `openSettingsWindow(SettingsSection)` to open/focus settings window

### Internationalization (i18n)

#### Configuration
- Uses i18next with React integration (`react-i18next`)
- Configuration file: `src/lib/i18n.ts`
- Supported languages: English (`en`), Simplified Chinese (`zh-CN`), System auto-detect
- Language hook: `useLanguage` in `src/hooks/use-language.ts`
- System language detection via Tauri's `@tauri-apps/plugin-os` API
- localStorage persistence with key: `settings-language`

#### File Structure
```
src/locales/
├── en/              # English translations
│   ├── common.json  # Navigation, UI chrome, general terms
│   ├── settings.json # Settings page content
│   ├── chat.json    # Chat interface strings
│   ├── tools.json   # Tool-related strings
│   └── actions.json # Action buttons (save, delete, etc.)
└── zh-CN/           # Chinese translations (same structure)
```

#### Translation Usage
```typescript
import { useTranslation } from "react-i18next"

function MyComponent() {
  const { t } = useTranslation("settings") // Specify namespace
  return <h1>{t("title")}</h1>
}

// With interpolation
t("filesAttached", { count: 5 }) // "5 file(s) attached"

// Multiple namespaces
const { t } = useTranslation(["common", "chat"])
```

#### Guidelines
- **Always** use `t()` for user-facing strings; never hardcode text
- Use semantic key names: `chat.sendMessage` not `btn_1`
- Organize translations with nested JSON structure
- Update both `en` and `zh-CN` files when adding keys
- Run `pnpm dlx tsx scripts/check-i18n.ts` before committing
- Use appropriate namespace: common, settings, chat, tools, actions
- Provide context in keys: `buttons.save` vs `buttons.saveSettings`
- Use interpolation for dynamic content: `{{count}}`, `{{name}}`

#### Translation Completeness Check
- Script: `scripts/check-i18n.ts`
- Automatically runs in pre-commit hook (lefthook)
- Verifies all keys exist in all language files
- Checks JSON validity and nested structure consistency
- Fails commit if translations are incomplete

#### Language Management
```typescript
import { useLanguage } from "@/hooks/use-language"

const { language, changeLanguage, isDetecting } = useLanguage()
// language: "en" | "zh-CN" | "system"
// changeLanguage("zh-CN") or changeLanguage("system")
```

#### Common Patterns
```typescript
// Navigation items
const { t } = useTranslation("common")
const items = [
  { label: t("nav.settings"), href: "/settings" }
]

// Toast notifications
import { toast } from "sonner"
toast.success(t("toast.chatDeleted"))
toast.error(t("toast.error"), { description: t("toast.failedToDeleteChat") })

// Form labels
<Label>{t("settings:form.apiKey")}</Label>
```

#### Best Practices
- ✅ Use semantic keys organized hierarchically
- ✅ Keep all language files in sync
- ✅ Use interpolation for dynamic values
- ✅ Run check script before committing
- ❌ Never hardcode user-facing strings
- ❌ Don't use abbreviations or technical keys
- ❌ Don't mix languages in the same file
- ❌ Don't use translations for code logic (identifiers, conditions)

### Settings Store System

**File**: `src/hooks/use-settings-store.ts` (Tauri Plugin Store with auto-save)

**Main Hooks**:
- `useSetting<K>(key)` - Single setting (recommended): `const [theme, setTheme] = useSetting("theme")`
- `useSettings()` - All settings: `const [settings, updateSetting] = useSettings()`
- `getSetting(key)` / `setSetting(key, value)` - Outside React

**Features**:
- Auto-save to `settings.json`
- Deep merge for nested settings (e.g., shortcuts)
- Cross-window sync via `setting-changed` event
- Schema migration support

### Keyboard Shortcuts System

**Types**: `src/types/settings.ts` | **Utilities**: `src/lib/shortcut-*.ts` | **Backend**: `src-tauri/src/shortcuts.rs`

**Shortcut Actions** (ShortcutAction enum):
- Global: `TOGGLE_WINDOW` (Shift+Alt+W)
- Local: `TOGGLE_SIDEBAR`, `OPEN_SETTINGS`, `SEARCH_HISTORY`, `SEND_MESSAGE`, `NEW_LINE`, `NEW_CHAT`

**Main Hooks**:
- `useShortcutConfig()` - Get all shortcuts
- `useShortcut(action)` - Get specific shortcut
- `useShortcutDisplay(action)` - Get formatted keys (e.g., ["⌘", "B"])

**Utilities**:
- `formatShortcutForDisplay(key)` - Convert to platform symbols
- `matchesShortcut(event, key)` - Check if event matches shortcut

**Global Shortcuts**: Registered in Rust (`src-tauri/src/shortcuts.rs`) using `tauri-plugin-global-shortcut`

### Database & Chat Storage

**File**: `src/lib/database.ts` (Tauri Plugin SQL - SQLite)

**API**:
- `getDatabase()` - Get DB instance (preferred, auto-initializes)
- `initDatabase()` - Manual initialization

**Usage**: `const db = await getDatabase(); const chats = await db.select("SELECT * FROM chats WHERE id = ?", [id])`

**Tables**: `chats`, `messages` (check `src-tauri/migrations/` for schema)

**Best Practice**: Always use parameterized queries to prevent SQL injection

### Provider Logo System

**Component**: `src/components/ui/provider-logo.tsx`

**Usage**: `<ProviderLogo providerId="minimax" className="size-5" />`

**Supported**: MiniMax, OpenAI, Anthropic, Gemini, Kimi, Zhipu (custom SVG icons in `src/components/icons/`)

**Fallback**: Uses Lucide `icon` from provider config if no custom logo

## Code Review Checklist
- [ ] All comments are in English
- [ ] TypeScript types are properly defined
- [ ] No console.log statements (use proper logging)
- [ ] Error handling is implemented
- [ ] Code follows project structure
- [ ] Accessibility considerations are addressed
- [ ] Tests are included for new features
- [ ] Documentation is updated if needed
- [ ] Settings changes use `useSetting` hook (auto-persisted and synced)
- [ ] Cross-window events emitted for important state changes
- [ ] Keyboard shortcuts registered in settings schema if global
- [ ] Database queries use parameterization
