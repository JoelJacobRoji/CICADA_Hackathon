/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Shown in the data-source banner, e.g. "SIMULATED - AEGIS dev simulator". Set at build time. */
  readonly VITE_DATA_SOURCE_LABEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
