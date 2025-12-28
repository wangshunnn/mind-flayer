import { RuleConfigSeverity, type UserConfig } from "@commitlint/types"

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [RuleConfigSeverity.Error, "always", 1000]
  }
}

export default Configuration
