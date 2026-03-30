# Releasing Mind Flayer

## One-time setup

1. Keep the updater private key safe at `~/.tauri/mind-flayer-updater.key`.
2. Add the GitHub repository secrets below before the first public release.

## GitHub Secrets

| Secret | Required | What it should contain | How to get it |
| --- | --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Yes | Full contents of `~/.tauri/mind-flayer-updater.key` | Generated locally with `pnpm tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional | Password used when generating the updater private key | Leave empty if the key was generated without a password |
| `APPLE_CERTIFICATE` | Yes | Base64-encoded Developer ID Application `.p12` certificate | Export from Keychain Access, then base64-encode it |
| `APPLE_CERTIFICATE_PASSWORD` | Yes | Password used when exporting the `.p12` certificate | Chosen when exporting the certificate |
| `APPLE_SIGNING_IDENTITY` | Yes | Exact certificate identity string, for example `Developer ID Application: Your Name (TEAMID)` | `security find-identity -v -p codesigning` |
| `APPLE_API_ISSUER` | Yes | App Store Connect Issuer ID | App Store Connect > Users and Access > Integrations |
| `APPLE_API_KEY_ID` | Yes | App Store Connect Key ID | Same page as above |
| `APPLE_API_PRIVATE_KEY` | Yes | Raw contents of `AuthKey_<APPLE_API_KEY_ID>.p8` | Download once from App Store Connect when creating the key |

## Secret preparation

### 1. Updater signing key

Mind Flayer uses a Tauri updater signing key pair. The public key is committed in [tauri.conf.json](/Users/didi/.codex/worktrees/be0e/mind-flayer/src-tauri/tauri.conf.json); the private key must stay secret.

```sh
mkdir -p ~/.tauri
pnpm tauri signer generate --ci -w ~/.tauri/mind-flayer-updater.key
```

Then copy the private key into GitHub:

```sh
cat ~/.tauri/mind-flayer-updater.key
```

Set that full output as `TAURI_SIGNING_PRIVATE_KEY`.

### 2. Apple Developer certificate

You need a `Developer ID Application` certificate installed in your local Keychain, then export it as `.p12`.

Export and encode it:

```sh
base64 -i /path/to/DeveloperIDApplication.p12 | pbcopy
```

Paste the copied value into `APPLE_CERTIFICATE`.

To find the identity string used by the workflow:

```sh
security find-identity -v -p codesigning
```

Copy the exact `Developer ID Application: ...` line into `APPLE_SIGNING_IDENTITY`.

### 3. App Store Connect notarization key

Create an App Store Connect API key with `Developer` access, then save:

- `APPLE_API_ISSUER`: the Issuer ID shown above the keys table
- `APPLE_API_KEY_ID`: the Key ID from the created key row
- `APPLE_API_PRIVATE_KEY`: the full contents of the downloaded `AuthKey_<KEY_ID>.p8` file

Do not base64-encode the `.p8` file for this setup. The workflow writes the raw secret into a temporary file and passes that path to Tauri via `APPLE_API_KEY_PATH`.

## Secret-to-workflow mapping

The release workflow maps GitHub Secrets to the environment variables Tauri expects:

- `TAURI_SIGNING_PRIVATE_KEY` -> updater signing private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` -> optional updater signing key password
- `APPLE_CERTIFICATE` -> base64 `.p12`
- `APPLE_CERTIFICATE_PASSWORD` -> `.p12` export password
- `APPLE_SIGNING_IDENTITY` -> signing identity name
- `APPLE_API_ISSUER` -> App Store Connect issuer id
- `APPLE_API_KEY_ID` -> App Store Connect key id
- `APPLE_API_PRIVATE_KEY` -> raw `.p8` contents, written to `APPLE_API_KEY_PATH` at runtime

## Verification checklist

Before pushing the first release tag, verify locally:

```sh
pnpm check:frontend
pnpm check:i18n
pnpm check:backend
pnpm build:sidecar
```

Then verify GitHub configuration:

1. Confirm every secret above exists in `Settings > Secrets and variables > Actions`.
2. Confirm the repo is public and Actions are enabled.
3. Confirm the `Release` workflow is present on the default branch.
4. Confirm the updater private key in GitHub matches the public key committed in [tauri.conf.json](/Users/didi/.codex/worktrees/be0e/mind-flayer/src-tauri/tauri.conf.json).

## First end-to-end release validation

1. Create a temporary test release from a throwaway commit or branch merge.
2. Run `pnpm release`.
3. Push `main`, then push the generated `vX.Y.Z` tag.
4. Watch the `Release` workflow in GitHub Actions.
5. Confirm the GitHub Release contains:
   - both macOS architectures
   - `.sig` updater signature files
   - `latest.json`
6. Download one generated `.dmg` and confirm macOS opens it without an unidentified developer warning.
7. Install the previous production build, launch it, and confirm the in-app updater discovers the new version.

## Release flow

1. Run `pnpm release`.
2. Review the generated release commit, version bumps, and `CHANGELOG.md`.
3. Push the release commit: `git push origin main`.
4. Push the generated version tag: `git push origin vX.Y.Z`.
5. Wait for the `Release` GitHub Actions workflow to publish the signed GitHub Release.

## Expected result

- The `Release` workflow builds both `aarch64-apple-darwin` and `x86_64-apple-darwin`.
- GitHub Releases hosts the signed bundles, updater signatures, and `latest.json`.
- Installed production builds can discover the latest stable release through the in-app updater.
