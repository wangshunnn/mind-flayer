# 👻 Mind Flayer

<p align="center">
  <img src="src-tauri/icons/256x256.png" width="128" alt="Mind Flayer Logo" />
</p>

<p align="center">A powerful desktop AI assistant app built with Tauri, React, Vercel AI SDK and more!</p>

<p align="center">Models · Memory · Tools · Skills · Channels</p>

<br>

<div align="center">
  <p>
    <img src="https://img.shields.io/badge/Tauri2.0-24C8DB?logo=tauri&logoColor=FFC131">
    <img src="https://img.shields.io/badge/Rust-c57c54?logo=rust&logoColor=E34F26">
    <img src="https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=fff">
    <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=fff">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff">
    <img src="https://img.shields.io/badge/React%2019-2C4F7C?logo=react&logoColor=61DAFB">
    <img src="https://img.shields.io/badge/TanStack%20Router-FF4154?logo=reactrouter&logoColor=fff">
    <img src="https://img.shields.io/badge/i18next-26A69A?logo=i18next&logoColor=fff">
    <img src="https://img.shields.io/badge/Vercel%20AI%20SDK-000000?logo=vercel&logoColor=white">
    <img src="https://img.shields.io/badge/shadcn/ui-000000?logo=shadcnui&logoColor=fff">
    <img src="https://img.shields.io/badge/Tailwind%20CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white">
    <img src="https://img.shields.io/badge/Biome-60A5FA?logo=biome&logoColor=fff">
    <img src="https://img.shields.io/badge/Vite8-646CFF?logo=vite&logoColor=fff">
    <img src="https://img.shields.io/badge/Vitest4-6E9F18?logo=vitest&logoColor=fff">
    <img src="https://img.shields.io/badge/pnpm10-F69220?logo=pnpm&logoColor=fff">
    <img src="https://img.shields.io/badge/lefthook-E93d30?logo=lefthook&logoColor=fff">
  </p>
</div>

<p align="center">
  English | <a href="README.zh-CN.md">简体中文</a>
</p>

<br>

## Screenshots

<p align="center">
  <img height="500" alt="Desktop App Screenshot" src="preview/img-2.png" />
  <br>
  <em>Desktop App</em>
</p>

<p align="center">
  <img height="500" alt="App Settings Screenshot" src="preview/img-3.png" />
  <br>
  <em>App Settings</em>
</p>

<p align="center">
  <img height="500" alt="Telegram Bot Integration Screenshot" src="preview/telegram-bot.png" />
  <br>
  <em>Telegram Bot Integration</em>
</p>

<br>

## Development

```sh
pnpm install          # Install all dependencies
pnpm dev              # Start development (frontend + Tauri)
pnpm test             # Run all tests (vitest + cargo)
pnpm build            # Build for production
```

<br>

## Releasing

The macOS release pipeline and updater setup are documented in [docs/releasing.md](docs/releasing.md).

<br>

## Tech Stack

### Frontend

- **[React 19](https://react.dev/)** - JavaScript library for building user interfaces with latest concurrent features and optimizations
- **[TypeScript](https://www.typescriptlang.org/)** - JavaScript superset with type safety and better developer experience
- **[Vite 8](https://vitejs.dev/)** - Next-generation frontend build tool with blazing-fast dev server and optimized production builds
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS framework for rapidly building modern UIs
- **[shadcn/ui](https://ui.shadcn.com/)** - Beautifully designed components built with Radix UI and Tailwind CSS
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing framework for React with built-in search params validation
- **[i18next](https://www.i18next.com/)** - Internationalization framework supporting English and Simplified Chinese

### Backend

- **[Tauri 2.0](https://tauri.app/)** - Build lightweight, secure, and cross-platform desktop applications with web technologies
- **[Rust](https://www.rust-lang.org/)** - High-performance, memory-safe systems programming language powering Tauri's backend
- **[Hono](https://hono.dev/)** - Ultrafast web framework for the sidecar server, handling API routing and middleware
- **[SQLite](https://www.sqlite.org/)** - Lightweight embedded database for chat history and message persistence

### AI Integration

- **[AI SDK](https://ai-sdk.dev/)** - Vercel AI SDK for building AI-powered streaming text and chat applications with Framework hooks and unified API

### Development Tools

- **[pnpm 10](https://pnpm.io/)** - Fast, disk space efficient package manager
- **[Biome](https://biomejs.dev/)** - Unified formatter and linter, replacing Prettier and ESLint
- **[Vitest](https://vitest.dev/)** - Vite-native unit testing framework for fast test experience
- **[Lefthook](https://github.com/evilmartians/lefthook)** - Fast and powerful Git hooks manager
- **[Commitlint](https://commitlint.js.org/)** - Lint commit messages according to conventional standards
- **[Release-it](https://github.com/release-it/release-it)** - Automated versioning and package publishing
