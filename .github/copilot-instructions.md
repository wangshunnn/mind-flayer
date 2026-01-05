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

## Code Review Checklist
- [ ] All comments are in English
- [ ] TypeScript types are properly defined
- [ ] No console.log statements (use proper logging)
- [ ] Error handling is implemented
- [ ] Code follows project structure
- [ ] Accessibility considerations are addressed
- [ ] Tests are included for new features
- [ ] Documentation is updated if needed
