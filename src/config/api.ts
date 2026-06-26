const DEFAULT_PLATFORM_API_BASE_URL = '/platform-api'

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export const PLATFORM_API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_PLATFORM_API_BASE_URL || DEFAULT_PLATFORM_API_BASE_URL,
)

export const PLATFORM_SWAGGER_DOC_URL = `${PLATFORM_API_BASE_URL}/v3/api-docs/所有接口`
