/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which portal this build is for: 'poki' (default) or 'crazygames'. */
  readonly VITE_PLATFORM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
