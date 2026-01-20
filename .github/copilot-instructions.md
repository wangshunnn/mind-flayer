# GitHub Copilot Instructions for Mind Flayer

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
- Multi-section layout with sidebar navigation (提供商/通用/高级/关于)
- Provider configuration UI located at `/settings`
- Supported providers: MiniMax, OpenAI, Anthropic, Parallel (Web Search)
- Features:
  - Password visibility toggle for API key input
  - Optional base URL override with default values
  - Real-time form validation
  - Save/Delete operations with confirmation dialogs
  - Proper loading states and error handling
- UI components: Uses InputGroup with password toggle, responsive layout
- macOS traffic lights support with drag region
- Entry animation with smooth transitions

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

## Code Review Checklist
- [ ] All comments are in English
- [ ] TypeScript types are properly defined
- [ ] No console.log statements (use proper logging)
- [ ] Error handling is implemented
- [ ] Code follows project structure
- [ ] Accessibility considerations are addressed
- [ ] Tests are included for new features
- [ ] Documentation is updated if needed
