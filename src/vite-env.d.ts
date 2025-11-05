/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_API: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

