# Atomic Commit

Stage and commit changes atomically - one logical change per commit.

## Format

```
type(scope?): description
```

## Types (commitlint/config-conventional)

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting (no code change) |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Add/modify tests |
| `chore` | Build/tooling changes |
| `build` | Build system changes |
| `ci` | CI configuration |
| `revert` | Revert a commit |

## Examples

```
feat(auth): add login functionality
fix: resolve race condition in data fetch
docs: update API documentation
refactor(components): extract common button logic
chore: update dependencies
```

## Process

```bash
git status
git diff --stat
git add <files>
git commit -m "type(scope): description"
```

## Decision

```
Unrelated changes?
├── Yes → Separate commits
└── No → One commit with clear type
```
