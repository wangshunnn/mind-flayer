# AI Documentation Update Prompts

本文档提供了在添加新功能或重大变更时，提醒 AI 同步更新文档的标准提示词。

## 📚 需要更新的文档

- `.claude/CLAUDE.md` - Claude Code 指令文档
- `.github/copilot-instructions.md` - GitHub Copilot 指令文档

## 🎯 何时需要更新

### 必须更新的场景

| 场景 | 示例 | 影响范围 |
|------|------|----------|
| **新增核心功能** | 添加新的存储系统、消息系统 | 架构章节、API 章节 |
| **修改现有 API** | Settings hook 签名变化 | 相关 API 文档、代码示例 |
| **新增设置项** | AppSettings 接口新增字段 | Settings Schema 章节 |
| **新增快捷键** | ShortcutAction 新增枚举值 | Keyboard Shortcuts 章节 |
| **新增 i18n 命名空间** | 添加新的翻译文件 | i18n 章节 |
| **新增 Tauri 命令** | 添加新的 IPC 接口 | Tauri Integration 章节 |
| **新增 Provider** | 支持新的 AI 模型提供商 | Provider 相关章节 |
| **新增工具系统** | 添加新的 Tool 类型 | 需要新增 Tools 章节 |

### 可选更新的场景

- 优化现有代码（不改变 API）
- 修复 bug（不影响使用方式）
- 样式调整
- 性能优化（不改变接口）

## 📝 推荐提示词模板

### 通用更新提示

```
我刚刚 [添加了XX功能/修改了XX系统]，请检查并更新以下AI指令文档：
1. .claude/CLAUDE.md
2. .github/copilot-instructions.md

重点更新 [具体章节名称] 部分，确保：
- 新的API签名准确
- 代码示例可运行
- 最佳实践反映新变化
- 两个文档保持一致
```

### 新增功能时

```
✨ 新功能：[功能名称]

涉及的变更：
- 新增文件：[列出关键文件]
- 新增API：[列出新API]
- 新增类型：[列出新类型]

请更新AI文档，添加以下内容：
1. 在 [章节名] 添加功能说明
2. 添加使用示例代码
3. 添加到相关最佳实践
4. 更新 Code Review Checklist（如适用）
```

### 修改现有 API 时

```
🔧 API变更：[API名称]

变更内容：
- 旧签名：[代码]
- 新签名：[代码]
- 变更原因：[简要说明]

请更新AI文档中所有相关位置：
1. API定义部分
2. 使用示例
3. 常用模式
4. 如有breaking change，添加迁移说明
```

### 新增配置项时

```
⚙️ 新增设置：[设置项名称]

添加到：AppSettings / ShortcutAction / SettingsSection 等

请更新：
1. Schema 定义
2. 默认值说明
3. 使用示例
4. 相关 Hook 说明（如 useSetting）
```

### 新增 i18n 内容时

```
🌐 i18n 更新：[新增命名空间/新增key]

请在AI文档的 i18n 章节更新：
1. File Structure（如新增文件）
2. 使用示例（如新增模式）
3. Common Patterns（如有新用法）
```

### 批量检查时

```
📋 完整性检查

请检查以下AI文档是否需要更新：
- .claude/CLAUDE.md
- .github/copilot-instructions.md

对比实际代码库，检查这些部分：
1. Settings Schema vs src/types/settings.ts
2. Shortcut Actions vs ShortcutAction enum
3. i18n namespaces vs src/locales/
4. Hooks API vs src/hooks/
5. Database API vs src/lib/database.ts
6. 所有代码示例是否还能运行

输出差异列表，然后更新文档。
```

## 🤖 自动化提醒（可选）

### 方案A：Git Pre-commit Hook

在 `lefthook.yml` 添加检查：

```yaml
pre-commit:
  commands:
    check-ai-docs:
      run: |
        if git diff --cached --name-only | grep -E "src/types/settings.ts|src/lib/.*\.ts|src/hooks/use-.*\.ts"; then
          echo "⚠️  检测到核心文件变更，请考虑更新AI文档："
          echo "   - .claude/CLAUDE.md"
          echo "   - .github/copilot-instructions.md"
        fi
```

### 方案B：PR Template

在 `.github/PULL_REQUEST_TEMPLATE.md` 添加检查项：

```markdown
## Documentation Updates

- [ ] AI instruction docs updated (if applicable)
  - [ ] `.claude/CLAUDE.md`
  - [ ] `.github/copilot-instructions.md`
```

## 💡 最佳实践

1. **功能开发完成后立即更新** - 记忆最新鲜，细节最准确
2. **使用具体的提示词** - 明确指出要更新的章节和内容
3. **验证代码示例** - 确保文档中的代码可以直接运行
4. **保持两个文档同步** - 核心信息应该在两个文档中一致
5. **定期审查** - 每月检查一次文档与代码的一致性

## 🔍 快速验证命令

```bash
# 检查 Settings Schema 是否最新
diff <(grep -A 30 "interface AppSettings" .claude/CLAUDE.md) \
     <(grep -A 30 "export interface AppSettings" src/types/settings.ts)

# 检查 i18n 文件列表
ls src/locales/en/

# 检查 Shortcut Actions
grep "export enum ShortcutAction" src/types/settings.ts
```

---

**记住**：良好维护的文档是 AI 协作效率的关键！🚀
