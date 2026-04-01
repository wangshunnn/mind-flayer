export default {
  npm: {
    publish: false
  },
  github: {
    release: false
  },
  git: {
    requireCleanWorkingDir: true,
    requireUpstream: true,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: release-it resolves this placeholder.
    commitMessage: "chore(release): v${version}",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: release-it resolves this placeholder.
    tagName: "v${version}",
    push: false
  },
  hooks: {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: release-it resolves this placeholder.
    "after:bump": "pnpm release:sync-version ${version}"
  },
  plugins: {
    "@release-it/conventional-changelog": {
      preset: "conventionalcommits",
      infile: "CHANGELOG.md"
    }
  }
}
