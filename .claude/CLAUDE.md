# Claude Code Instructions for Mind Flayer

## Core Principles

### Language Requirements

- **All code comments MUST be written in English**
- Use clear, concise English for variable names, function names, and documentation
- Commit messages should follow conventional commits specification in English
- Documentation should be comprehensive and written in English

### Communication Style

- Keep responses concise and focused
- Provide complete solutions rather than partial suggestions
- When implementing features, write the actual code instead of describing what to do
- Use proper Markdown formatting with file links
- Avoid unnecessary explanations unless complexity requires it

## Code Style and Standards

### TypeScript/React Guidelines

#### Component Structure

- Use TypeScript strict mode features with no implicit any
- Prefer functional components with hooks over class components
- Use `const` for component declarations with arrow functions
- Implement proper TypeScript types and interfaces
- Place types/interfaces close to where they're used
- Extract reusable logic into custom hooks

#### Import Organization

Follow this order:

1. React imports
2. Third-party library imports
3. Local component imports
4. Utility imports
5. Type imports (using `import type`)

```typescript
import { useState, useEffect } from "react"
import { useAI } from "@ai-sdk/react"
import { AppSidebar } from "@/components/app-sidebar"
import { cn } from "@/lib/utils"
import type { Message } from "@/types"
```

#### Component Best Practices

- Keep components small and focused (single responsibility principle)
- Use named exports for components
- Prefer composition over inheritance
- Implement proper prop validation with TypeScript interfaces
- Use destructuring for props

```typescript
interface ChatMessageProps {
  message: Message
  onReply?: (content: string) => void
}

export const ChatMessage = ({ message, onReply }: ChatMessageProps) => {
  // Component implementation
}
```

### Styling Guidelines

#### Tailwind CSS Usage

- Use Tailwind utility classes for styling
- Follow the existing design system (Radix UI + Tailwind)
- Use `cn` utility from `@/lib/utils` for conditional classes
- Keep component-specific styles within the component file
- Use consistent spacing scale (4px increments)

```typescript
<div className={cn(
  "flex items-center gap-2 p-4",
  isActive && "bg-accent",
  className
)}>
```

#### Dark Mode Support

- Always implement dark mode support using Tailwind's dark: variant
- Use semantic color tokens from the theme
- Test both light and dark modes

### State Management

#### Local State

- Use `useState` for simple component state
- Use `useReducer` for complex state logic with multiple sub-values
- Keep state as local as possible; lift state only when necessary
- Avoid prop drilling beyond 2-3 levels; consider context or composition

#### Global State

- Use React Context sparingly for truly global state
- Prefer prop drilling for shallow component hierarchies
- Consider custom hooks for shared stateful logic

```typescript
// Good: Local state
const [isOpen, setIsOpen] = useState(false)

// Good: Complex state with reducer
const [state, dispatch] = useReducer(chatReducer, initialState)
```

### File and Folder Structure

#### Naming Conventions

- **Components**: PascalCase (e.g., `AppChat.tsx`, `MessageList.tsx`)
- **Utilities and hooks**: kebab-case (e.g., `use-compact.ts`, `format-date.ts`)
- **Types**: PascalCase with `.types.ts` suffix if in separate file
- **Constants**: UPPER_SNAKE_CASE in `constants.ts` files

#### Organization

```
src/
├── components/          # React components
│   ├── app-chat.tsx    # Main components
│   ├── ui/             # Reusable UI components
│   └── ai-elements/    # AI-specific components
├── hooks/              # Custom React hooks
├── lib/                # Utilities and helpers
├── pages/              # Page components
└── styles/             # Global styles
```

### Error Handling

#### Async Operations

- Always wrap async operations in try-catch blocks
- Provide meaningful error messages
- Use TypeScript's strict null checks
- Handle errors at the appropriate level

```typescript
try {
  const result = await fetchData()
  setData(result)
} catch (error) {
  console.error("Failed to fetch data:", error)
  setError(error instanceof Error ? error.message : "Unknown error")
}
```

#### Error Boundaries

- Implement error boundaries for critical component trees
- Provide fallback UI for error states
- Log errors appropriately

### Testing Strategy

#### Unit Tests

- Write tests for utilities and custom hooks
- Use descriptive test names in English
- Follow AAA pattern (Arrange, Act, Assert)
- Aim for meaningful coverage, not 100% coverage

```typescript
describe("useCompact hook", () => {
  it("should toggle compact mode when called", () => {
    // Arrange, Act, Assert
  })
})
```

#### Integration Tests

- Test component interactions
- Mock external dependencies
- Test user workflows, not implementation details

## Rust/Tauri Backend Guidelines

### Rust Standards

- Follow Rust standard formatting (`cargo fmt`)
- Use meaningful, descriptive variable names
- Add doc comments (`///`) for all public APIs
- Handle errors with `Result` types; avoid `.unwrap()` in production code
- Use async/await for I/O operations

```rust
/// Starts the sidecar process with the given configuration
///
/// # Errors
/// Returns an error if the sidecar binary cannot be found or started
pub async fn start_sidecar(config: SidecarConfig) -> Result<Child> {
    // Implementation
}
```

### Tauri-Specific Guidelines

- Use Tauri's command system for frontend-backend communication
- Properly type all commands with TypeScript bindings
- Handle cross-platform differences (macOS, Windows, Linux)
- Minimize IPC calls for performance
- Use Tauri's state management for shared state

```rust
#[tauri::command]
async fn send_message(message: String) -> Result<String, String> {
    // Handle the command
    Ok(response)
}
```

### Sidecar Process Management

- Implement graceful shutdown for sidecar processes
- Handle sidecar lifecycle properly (start, stop, restart)
- Log errors and important events appropriately
- Use middleware pattern for request/response handling
- Ensure proper cleanup on application exit

## AI Integration

### AI SDK Usage

- Use AI SDK (`@ai-sdk/react`) for AI interactions
- Handle streaming responses properly with loading states
- Implement proper error handling for AI API failures
- Cache AI responses when appropriate to reduce costs
- Show loading indicators during AI processing

```typescript
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat(
  {
    api: "/api/chat",
    onError: (error) => {
      console.error("Chat error:", error)
    },
  }
)
```

### Response Handling

- Display streaming responses progressively
- Handle partial responses gracefully
- Implement retry logic for failed requests
- Provide user feedback for long-running operations

## Security & Keychain Management

### Encrypted Storage Architecture

Mind Flayer implements a secure keychain system for storing sensitive API keys and provider configurations:

#### Storage Implementation

**Backend (Rust)**:
- Location: `src-tauri/src/keychain.rs`
- Encryption: AES-256-GCM with machine-specific keys
- Key derivation: SHA-256 hash of device name + salt
- Storage format: Base64-encoded encrypted JSON
- File location: `{LOCAL_DATA_DIR}/mind-flayer/provider_configs.dat`
- Fixed nonce: `b"mind-flayer!"` (12 bytes)

**Frontend (TypeScript)**:
- Hook: `useProviderConfig` in `src/hooks/use-provider-config.ts`
- Provides: `saveConfig`, `getConfig`, `deleteConfig`, `listProviders`
- Automatic loading state and error handling
- Types: `ProviderConfig { apiKey: string, baseUrl?: string }`

#### Tauri Commands

```rust
// Save configuration (encrypts and stores locally, then pushes to sidecar)
save_provider_config(provider: String, api_key: String, base_url: Option<String>) -> Result<(), String>

// Retrieve configuration from encrypted storage
get_provider_config(provider: String) -> Result<ProviderConfig, String>

// Delete configuration and update sidecar
delete_provider_config(provider: String) -> Result<(), String>

// List all configured provider names
list_all_providers() -> Vec<String>
```

#### Configuration Flow

1. User enters API key in Settings page
2. Frontend calls `saveConfig` via `useProviderConfig` hook
3. Tauri invokes `save_provider_config` command
4. Rust keychain module encrypts and saves to local file
5. Configuration is automatically pushed to sidecar via stdin
6. Sidecar updates in-memory provider configs

#### Security Best Practices

- **Never** store API keys in plain text, localStorage, or environment variables
- Always use the keychain module for sensitive data
- Keys are bound to the device (cannot be copied to another machine)
- Use proper error handling; don't expose encryption details
- Log operations but never log sensitive values
- Implement proper cleanup on application uninstall (future enhancement)

### Settings Page Implementation

#### Page Structure

**Location**: `src/pages/Settings.tsx`

**Layout**:
- Left sidebar: Section navigation (提供商/通用/高级/关于)
- Main content: Section-specific forms and controls
- macOS traffic lights support with drag region
- Inset background design with smooth animations

#### Provider Configuration Section

**Supported Providers**:
```typescript
const PROVIDERS = [
  { id: "minimax", name: "MiniMax", defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1" },
  { id: "openai", name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1" },
  { id: "parallel", name: "Parallel (Web Search)", defaultBaseUrl: "" }
]
```

**Form Fields**:
1. **API Key** (required):
   - Password input with visibility toggle (Eye/EyeOff icons)
   - Uses `InputGroup` with `InputGroupButton` for toggle
   - Validation: Cannot be empty

2. **Base URL** (optional):
   - Text input for custom endpoints
   - Shows default value as placeholder/hint
   - Useful for proxy servers or alternative endpoints

**User Interactions**:
- Select provider from left list
- Form auto-loads saved configuration for selected provider
- Save button: Validates and saves to keychain
- Delete button: Shows confirmation dialog before deletion
- Success/error feedback via alerts (consider replacing with toast notifications)

#### State Management

```typescript
const [formData, setFormData] = useState<Record<string, ProviderFormData>>({...})
const { saveConfig, getConfig, deleteConfig, isLoading, error } = useProviderConfig()

// Load config when provider changes
useEffect(() => {
  const loadConfig = async () => {
    const config = await getConfig(activeProvider)
    if (config) {
      setFormData(prev => ({ ...prev, [activeProvider]: config }))
    }
  }
  loadConfig()
}, [activeProvider])
```

#### UI Components Used

- `InputGroup`, `InputGroupInput`, `InputGroupButton`: Password field with toggle
- `Button`: Save/Delete actions with loading states
- `Label`: Form field labels with required indicators
- `Separator`: Visual section dividers
- `Lucide Icons`: Eye, EyeOff, Key, Bot, Brain, etc.

#### Future Enhancements

- Replace `alert()` with toast notifications
- Add form-level validation
- Implement settings export/import
- Add connection testing for providers
- Implement "通用", "高级", and "关于" sections

## Documentation

### Code Documentation

- Add JSDoc comments for complex functions and public APIs
- Document component props with TypeScript interfaces
- Include usage examples for reusable components
- Keep README files updated with current project state
- Avoid adding excessive comments unless necessary

```typescript
/**
 * Formats a date relative to the current time
 * @param date - The date to format
 * @returns A human-readable relative time string (e.g., "2 hours ago")
 */
export const formatRelativeTime = (date: Date): string => {
  // Implementation
}
```

### README Files

- Keep main README up to date
- Include setup instructions
- Document environment variables
- Provide troubleshooting section

## Performance Optimization

### React Performance

- Memoize expensive computations with `useMemo`
- Optimize re-renders with `useCallback` and `React.memo`
- Avoid unnecessary dependencies in hook dependency arrays
- Use lazy loading for routes and heavy components

```typescript
const expensiveValue = useMemo(() => computeExpensiveValue(data), [data])
const handleClick = useCallback(() => doSomething(id), [id])
```

### Bundle Optimization

- Code-split large components and routes
- Lazy load non-critical features
- Optimize images and assets
- Monitor bundle size

## Accessibility (a11y)

### Best Practices

- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, etc.)
- Include proper ARIA labels where needed
- Ensure keyboard navigation support for all interactive elements
- Follow Radix UI accessibility guidelines
- Maintain sufficient color contrast ratios
- Test with screen readers

```typescript
<button aria-label="Send message" aria-pressed={isSending} disabled={isLoading}>
  Send
</button>
```

## Git Workflow

### Commit Messages

Follow conventional commits specification:

- **Format**: `type(scope): description`
- **Types**:
  - `feat`: New feature
  - `fix`: Bug fix
  - `docs`: Documentation changes
  - `style`: Code style changes (formatting, etc.)
  - `refactor`: Code refactoring
  - `test`: Adding or updating tests
  - `chore`: Maintenance tasks

```
feat(chat): add streaming support for AI responses
fix(sidebar): resolve navigation state issue
docs(readme): update installation instructions
```

### Branch Strategy

- Keep commits atomic and focused
- Write meaningful commit messages in English
- Squash small fixup commits before merging
- Review your own changes before requesting review

## Code Review Checklist

Before submitting code, ensure:

- [ ] All comments and documentation are in English
- [ ] TypeScript types are properly defined (no `any` without justification)
- [ ] No console.log statements (use proper logging)
- [ ] Error handling is implemented for async operations
- [ ] Code follows project structure and naming conventions
- [ ] Accessibility considerations are addressed
- [ ] Performance implications are considered
- [ ] Tests are included for new features or bug fixes
- [ ] Documentation is updated if needed
- [ ] Dark mode is supported for UI changes
- [ ] Cross-platform compatibility is verified (macOS, Windows, Linux)
- [ ] No hardcoded values; use configuration/environment variables

## Internationalization (i18n)

### Architecture Overview

Mind Flayer uses **i18next** with React integration for internationalization. The system supports multiple languages with automatic system language detection.

#### Supported Languages

- **English** (`en`): Default fallback language
- **Simplified Chinese** (`zh-CN`): Includes Traditional Chinese detection
- **System**: Auto-detect from OS locale

### File Structure

```
src/
├── lib/
│   └── i18n.ts              # i18next configuration
├── hooks/
│   └── use-language.ts      # Language management hook
├── locales/
│   ├── en/                  # English translations
│   │   ├── common.json      # Common UI strings
│   │   ├── settings.json    # Settings page
│   │   ├── chat.json        # Chat interface
│   │   ├── tools.json       # Tool-related strings
│   │   └── actions.json     # Action buttons
│   └── zh-CN/               # Chinese translations
│       ├── common.json
│       ├── settings.json
│       ├── chat.json
│       ├── tools.json
│       └── actions.json
scripts/
└── check-i18n.ts           # Translation completeness checker
```

### i18n Configuration

**File**: `src/lib/i18n.ts`

```typescript
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      settings: settingsEn,
      chat: chatEn,
      tools: toolsEn,
      actions: actionsEn
    },
    "zh-CN": { /* ... */ }
  },
  lng: "en",                 // Initial language (overridden by useLanguage hook)
  fallbackLng: "en",         // Fallback when translation missing
  defaultNS: "common",       // Default namespace
  interpolation: {
    escapeValue: false       // React already escapes values
  }
})
```

### Language Management Hook

**File**: `src/hooks/use-language.ts`

```typescript
import { useLanguage } from "@/hooks/use-language"

function MyComponent() {
  const { language, changeLanguage, isDetecting } = useLanguage()

  return (
    <Select value={language} onValueChange={changeLanguage}>
      <SelectItem value="en">English</SelectItem>
      <SelectItem value="zh-CN">简体中文</SelectItem>
      <SelectItem value="system">System (Auto-detect)</SelectItem>
    </Select>
  )
}
```

**Features**:
- Automatic OS language detection via Tauri's `locale()` API
- localStorage persistence (key: `settings-language`)
- System language mapping: `zh-*` → `zh-CN`, others → `en`
- Supports user-selected language or "system" auto-detection

### Translation Usage

#### Basic Usage

```typescript
import { useTranslation } from "react-i18next"

function ChatHeader() {
  const { t } = useTranslation("chat") // Specify namespace

  return (
    <h1>{t("title")}</h1>
    <p>{t("description")}</p>
  )
}
```

#### With Interpolation

```json
// locales/en/chat.json
{
  "messagesCount": "You have {{count}} messages"
}
```

```typescript
const { t } = useTranslation("chat")
<p>{t("messagesCount", { count: 5 })}</p>
// Output: "You have 5 messages"
```

#### Multiple Namespaces

```typescript
const { t } = useTranslation(["common", "chat"])

<Button>{t("common:buttons.save")}</Button>
<Input placeholder={t("chat:inputPlaceholder")} />
```

#### Default Namespace (common)

```typescript
const { t } = useTranslation() // Uses "common" by default

<p>{t("nav.newChat")}</p>  // From common.json
```

### Translation File Structure

#### Nested JSON Format

Organize translations hierarchically for better maintainability:

```json
// locales/en/common.json
{
  "nav": {
    "newChat": "New Chat",
    "recentChats": "Recent Chats",
    "settings": "Settings"
  },
  "theme": {
    "light": "Light",
    "dark": "Dark",
    "system": "Device"
  },
  "toast": {
    "success": "Success",
    "error": "Error",
    "chatDeleted": "Chat deleted"
  }
}
```

Access nested keys with dot notation:
```typescript
t("nav.newChat")      // "New Chat"
t("theme.dark")       // "Dark"
t("toast.success")    // "Success"
```

### Namespace Guidelines

#### Namespace Responsibilities

| Namespace  | Purpose                              | Examples                      |
| ---------- | ------------------------------------ | ----------------------------- |
| `common`   | Navigation, UI chrome, general terms | Sidebar, theme, footer        |
| `settings` | Settings page content                | Provider config, preferences  |
| `chat`     | Chat interface                       | Messages, input, suggestions  |
| `tools`    | Tool invocations, web search         | Tool names, parameters        |
| `actions`  | Action buttons, CRUD operations      | Save, delete, cancel, confirm |

#### When to Create a New Namespace

- When adding a major new feature (e.g., `calendar`, `exports`)
- When a section has 20+ translations
- When translations are semantically isolated

**Don't** create namespaces for:
- Single components (use existing namespaces)
- Temporary features
- Shared UI elements (use `common`)

### Translation Completeness Checking

**Script**: `scripts/check-i18n.ts`

Automatically run before commits via lefthook:

```bash
# Manual run
pnpm dlx tsx scripts/check-i18n.ts

# Output:
🔍 Checking i18n translation completeness...

📦 Namespace: common
──────────────────────────────────────────────────
✅ zh-CN: All keys match (42 keys)

📦 Namespace: settings
──────────────────────────────────────────────────
❌ zh-CN: Missing 2 keys (compared to en):
   - providers.parallel.description
   - sections.advanced.title
```

**What it checks**:
- All translation files exist for all languages
- Key parity between languages (no missing translations)
- JSON validity
- Nested key structure consistency

**CI Integration**: Runs in Git pre-commit hook via lefthook

### Best Practices

#### DO:

✅ **Use semantic keys**:
```json
{
  "chat": {
    "sendMessage": "Send",
    "inputPlaceholder": "Type a message..."
  }
}
```

✅ **Keep translations in sync**:
- Update all language files when adding new keys
- Run `check-i18n.ts` before committing

✅ **Use interpolation for dynamic content**:
```json
{"fileCount": "{{count}} file(s) attached"}
```
```typescript
t("fileCount", { count: files.length })
```

✅ **Provide context in key names**:
```json
{
  "buttons": {
    "save": "Save",
    "saveSettings": "Save Settings"
  }
}
```

✅ **Use namespaces to organize translations**:
```typescript
const { t } = useTranslation("settings")
```

#### DON'T:

❌ **Hardcode user-facing strings**:
```typescript
// Bad
<Button>Save</Button>

// Good
<Button>{t("actions:save")}</Button>
```

❌ **Use technical keys**:
```json
// Bad
{"btn_1": "Save", "lbl_usr_nm": "Username"}

// Good  
{"buttons.save": "Save", "labels.username": "Username"}
```

❌ **Mix languages in the same file**:
```json
// Bad - don't mix
{"title": "Settings", "description": "设置页面"}
```

❌ **Forget to update Chinese translations**:
- Every key in `en/*.json` must exist in `zh-CN/*.json`
- Run the check script to verify

❌ **Use translations for code identifiers**:
```typescript
// Bad
if (status === t("status.active")) { ... }

// Good
if (status === "active") {
  return t("status.active")
}
```

### Adding New Translations

#### Step-by-Step Process

1. **Identify the appropriate namespace** (common, settings, chat, tools, actions)

2. **Add English translation**:
   ```json
   // src/locales/en/settings.json
   {
     "providers": {
       "minimax": {
         "name": "MiniMax",
         "description": "MiniMax AI Platform"
       }
     }
   }
   ```

3. **Add Chinese translation**:
   ```json
   // src/locales/zh-CN/settings.json
   {
     "providers": {
       "minimax": {
         "name": "MiniMax",
         "description": "MiniMax AI 平台"
       }
     }
   }
   ```

4. **Use in component**:
   ```typescript
   const { t } = useTranslation("settings")
   <span>{t("providers.minimax.name")}</span>
   ```

5. **Verify completeness**:
   ```bash
   pnpm dlx tsx scripts/check-i18n.ts
   ```

### Common Patterns

#### Pattern 1: Navigation Items

```typescript
const { t } = useTranslation("common")

const navItems = [
  { icon: Home, label: t("nav.home"), href: "/" },
  { icon: Settings, label: t("nav.settings"), href: "/settings" },
]
```

#### Pattern 2: Form Labels & Validation

```typescript
const { t } = useTranslation("settings")

<Label>{t("form.apiKey")}</Label>
<Input
  placeholder={t("form.apiKeyPlaceholder")}
  error={t("form.apiKeyRequired")}
/>
```

#### Pattern 3: Toast Notifications

```typescript
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

const { t } = useTranslation("common")

toast.success(t("toast.chatDeleted"))
toast.error(t("toast.error"), {
  description: t("toast.failedToDeleteChat")
})
```

#### Pattern 4: Conditional Pluralization

```json
{
  "filesAttached_one": "{{count}} file attached",
  "filesAttached_other": "{{count}} files attached"
}
```

```typescript
t("filesAttached", { count: files.length })
// count=1: "1 file attached"
// count=5: "5 files attached"
```

### Testing i18n

#### Manual Testing

1. Change language in Settings: 提供商 → 通用 → 语言
2. Verify all UI strings update correctly
3. Test with "System" setting on different OS locales
4. Check for layout issues with longer Chinese strings

#### Automated Checks

```bash
# Pre-commit hook automatically runs:
pnpm dlx tsx scripts/check-i18n.ts
```

### Troubleshooting

#### Translations Not Updating

1. Verify `i18n.ts` imports the new/updated JSON file
2. Check if namespace is correctly specified in `useTranslation()`
3. Ensure dev server was restarted after adding new files

#### Missing Translations

1. Check key exists in both `en` and `zh-CN` folders
2. Run `check-i18n.ts` to identify missing keys
3. Verify nested structure matches exactly

#### System Language Not Detected

1. Verify Tauri `plugin-os` is installed
2. Check browser console for errors from `useLanguage` hook
3. Fallback to English is expected if detection fails

---

## Common Patterns

### Custom Hooks Pattern

```typescript
export const useChat = (initialMessages: Message[] = []) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true)
    try {
      // Implementation
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { messages, sendMessage, isLoading }
}
```

### Component Composition Pattern

```typescript
export const Card = ({ children, className, ...props }: CardProps) => (
  <div className={cn("rounded-lg border bg-card", className)} {...props}>
    {children}
  </div>
)

Card.Header = ({ children, className }: CardHeaderProps) => (
  <div className={cn("p-6", className)}>{children}</div>
)

Card.Content = ({ children, className }: CardContentProps) => (
  <div className={cn("p-6 pt-0", className)}>{children}</div>
)
```

## Tools and Commands

### Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Format & Lint code
pnpm check:frontend

# Run tests
pnpm test
```

### Useful Shortcuts

- Use Biome for formatting and linting
- Use lefthook for Git hooks
- Use commitlint for commit message validation

## Project-Specific Notes

### Mind Flayer Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri
- **Sidecar**: Node.js TypeScript process for AI proxy
- **AI Integration**: AI SDK for streaming responses

### Key Features

- Multi-model AI chat interface
- Custom font support
- Dark/light theme
- Compact mode for UI density
- Sidebar navigation with chat history

### Important Files

- `src-tauri/src/lib.rs`: Tauri backend entry point
- `sidecar/src/index.ts`: Sidecar process implementation
- `src/App.tsx`: Main application component
- `src/components/app-chat.tsx`: Chat interface
- `tauri.conf.json`: Tauri configuration

---

**Remember**: Write production-ready code, handle edge cases, and prioritize user experience and performance.
