/**
 * Environment configuration
 * Build-time constants injected by tsup
 */

export const IS_DEV = __IS_DEV__
export const NODE_ENV = IS_DEV ? "development" : "production"
