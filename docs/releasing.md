# Releasing Mind Flayer

## One-time setup

1. Keep the updater private key safe at `~/.tauri/mind-flayer-updater.key`.
2. Add the GitHub repository secrets below before the first public release.

## GitHub Secrets

| Secret | Required | What it should contain | How to get it |
| --- | --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Yes | Full contents of `~/.tauri/mind-flayer-updater.key` | Generated locally with `pnpm tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional | Password used when generating the updater private key | Leave empty if the key was generated without a password |

## Secret preparation

### Updater signing key

Mind Flayer uses a Tauri updater signing key pair. The public key is committed in [tauri.conf.json](../src-tauri/tauri.conf.json); the private key must stay secret.

```sh
mkdir -p ~/.tauri
pnpm tauri signer generate --ci -w ~/.tauri/mind-flayer-updater.key
```

Then copy the private key into GitHub:

```sh
cat ~/.tauri/mind-flayer-updater.key
```

Set that full output as `TAURI_SIGNING_PRIVATE_KEY`.

## What this release flow does

- Builds unsigned macOS artifacts for both `aarch64-apple-darwin` and `x86_64-apple-darwin`
- Publishes them to GitHub Releases
- Uploads Tauri updater signatures and `latest.json`
- Lets installed production builds check GitHub Releases for updates from inside the app
- Uses a stable asset naming pattern that is easy to extend to more platforms later

## What this release flow does not do

- No Apple `Developer ID Application` signing
- No notarization
- No Gatekeeper-friendly first-run experience for users downloading the app in a browser

This means the initial install experience on macOS is rougher. Users may need to manually allow the app in `System Settings > Privacy & Security` after the first launch attempt.

Apple's guidance for opening apps from an unknown developer:

- [Open a Mac app from an unknown developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)
- [Safely open apps on your Mac](https://support.apple.com/en-us/102445)

## Secret-to-workflow mapping

The release workflow maps GitHub Secrets to the environment variables Tauri expects:

- `TAURI_SIGNING_PRIVATE_KEY` -> updater signing private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` -> optional updater signing key password

## Release asset names

GitHub Release assets use this naming pattern:

```text
mind-flayer_[version]_[platform]_[arch][ext]
```

The release workflow derives `[platform]` and `[arch]` from per-target matrix metadata, so adding new platforms later only requires another matrix entry instead of a separate publish step.

For the current macOS-only matrix, you should expect names similar to:

- `mind-flayer_0.1.0_macOS_arm64.dmg`
- `mind-flayer_0.1.0_macOS_x64.dmg`
- `mind-flayer_0.1.0_macOS_arm64.app.tar.gz`
- `mind-flayer_0.1.0_macOS_x64.app.tar.gz`
- `mind-flayer_0.1.0_macOS_arm64.app.tar.gz.sig`
- `mind-flayer_0.1.0_macOS_x64.app.tar.gz.sig`
- `latest.json`

Notes:

- `.dmg` is for manual download and installation.
- `.app.tar.gz` is for the in-app updater.
- `.sig` is the updater signature for the matching `.app.tar.gz`.
- `latest.json` keeps the fixed Tauri updater filename and should not be renamed.

## Verification checklist

Before pushing the first release tag, verify locally:

```sh
pnpm check:frontend
pnpm check:i18n
pnpm check:backend
pnpm build:sidecar
```

Then verify GitHub configuration:

1. Confirm the required secret above exists in `Settings > Secrets and variables > Actions`.
2. Confirm the repo is public and Actions are enabled.
3. Confirm the `Release` workflow is present on the default branch.
4. Ensure the updater private key in GitHub matches the public key committed in [tauri.conf.json](../src-tauri/tauri.conf.json).

## First end-to-end release validation

1. Create a temporary test release from a throwaway commit or branch merge.
2. Run `pnpm release`.
3. Push `main`, then push the generated `vX.Y.Z` tag.
4. Watch the `Release` workflow in GitHub Actions.
5. Confirm the GitHub Release contains:
   - `mind-flayer_<version>_macOS_arm64.dmg`
   - `mind-flayer_<version>_macOS_x64.dmg`
   - `mind-flayer_<version>_macOS_arm64.app.tar.gz`
   - `mind-flayer_<version>_macOS_x64.app.tar.gz`
   - matching `.sig` updater signature files
   - `latest.json`
6. Download one generated `.dmg`, open the app, and if macOS blocks it use `Privacy & Security > Open Anyway`.
7. Install the previous production build, launch it, and confirm the in-app updater discovers the new version.
8. Accept the in-app update and confirm the app restarts into the new version.

## Release flow

1. Run `pnpm release`.
2. Review the generated release commit, version bumps, and `CHANGELOG.md`.
3. Push the release commit: `git push origin main`.
4. Push the generated version tag: `git push origin vX.Y.Z`.
5. Wait for the `Release` GitHub Actions workflow to publish the GitHub Release.

## Expected result

- The `Release` workflow builds both `aarch64-apple-darwin` and `x86_64-apple-darwin`.
- GitHub Releases hosts clearly named macOS bundles, updater signatures, and `latest.json`.
- Installed production builds can discover the latest stable release through the in-app updater.
