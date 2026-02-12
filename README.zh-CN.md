# 👻 Mind Flayer

<p align="center">
  <img src="src-tauri/icons/256x256.png" width="128" alt="Mind Flayer Logo" />
</p>

<p align="center">一个优雅简洁的桌面 AI 助手应用，基于 Tauri、React、Vercel AI SDK 等技术构建！</p>

<br>

<div align="center">
  <p>
    <img src="https://img.shields.io/badge/Tauri2.0-24C8DB?logo=tauri&logoColor=FFC131">
    <img src="https://img.shields.io/badge/Rust-c57c54?logo=rust&logoColor=E34F26">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff">
    <img src="https://img.shields.io/badge/React%2019-2C4F7C?logo=react&logoColor=61DAFB">
    <img src="https://img.shields.io/badge/Vercel%20AI%20SDK-000000?logo=vercel&logoColor=white">
    <img src="https://img.shields.io/badge/shadcn/ui-000000?logo=shadcnui&logoColor=fff">
    <img src="https://img.shields.io/badge/Tailwind%20CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white">
    <img src="https://img.shields.io/badge/Biome-60A5FA?logo=biome&logoColor=fff">
    <img src="https://img.shields.io/badge/Vite7-646CFF?logo=vite&logoColor=fff">
    <img src="https://img.shields.io/badge/Vitest4-6E9F18?logo=vitest&logoColor=fff">
    <img src="https://img.shields.io/badge/pnpm10-F69220?logo=pnpm&logoColor=fff">
    <img src="https://img.shields.io/badge/lefthook-E93d30?logo=lefthook&logoColor=fff">
  </p>
</div>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

<br>

## 截图

<p align="center">
  <img height="500" alt="应用截图 1" src="preview/img-1.png" />
</p>

<br>

## 开发

```sh
pnpm install          # 安装全部依赖
pnpm dev              # 启动开发环境（前端 + Tauri）
pnpm test             # 运行全部测试（vitest + cargo）
pnpm build            # 构建生产版本
```

<br>

## 技术栈

### 前端

- **[React 19](https://react.dev/)** - 用于构建用户界面的 JavaScript 库，支持最新的并发特性和优化
- **[TypeScript](https://www.typescriptlang.org/)** - 具有类型安全和更好开发体验的 JavaScript 超集
- **[Vite 7](https://vitejs.dev/)** - 下一代前端构建工具，拥有极速的开发服务器和优化的生产构建
- **[Tailwind CSS 4](https://tailwindcss.com/)** - 实用优先的 CSS 框架，用于快速构建现代 UI
- **[shadcn/ui](https://ui.shadcn.com/)** - 基于 Radix UI 和 Tailwind CSS 构建的精美设计组件库

### 后端

- **[Tauri 2.0](https://tauri.app/)** - 使用 Web 技术构建轻量、安全且跨平台的桌面应用
- **[Rust](https://www.rust-lang.org/)** - 高性能、内存安全的系统编程语言，为 Tauri 后端提供支持

### AI 集成

- **[AI SDK](https://ai-sdk.dev/)** - Vercel AI SDK，用于通过框架 hooks 和统一 API 构建 AI 驱动的流式文本和聊天应用

### 开发工具

- **[pnpm 10](https://pnpm.io/)** - 快速、节省磁盘空间的包管理器
- **[Biome](https://biomejs.dev/)** - 统一的格式化和 lint 工具，替代 Prettier 和 ESLint
- **[Vitest](https://vitest.dev/)** - Vite 原生单元测试框架，提供快速测试体验
- **[Lefthook](https://github.com/evilmartians/lefthook)** - 快速而强大的 Git hooks 管理器
- **[Commitlint](https://commitlint.js.org/)** - 根据约定标准检查 commit 信息
- **[Release-it](https://github.com/release-it/release-it)** - 自动化版本控制和包发布

<br>
