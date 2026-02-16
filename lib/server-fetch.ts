type NextFetchOptions = RequestInit & {
  next?: {
    revalidate?: number
  }
  timeoutMs?: number
}

export interface FetchJsonResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Unknown fetch error"
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  options: NextFetchOptions = {}
): Promise<FetchJsonResult<T>> {
  const { timeoutMs = 7000, ...fetchOptions } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    } as any)

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error:
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "Request failed")
            : `Request failed with status ${response.status}`,
      }
    }

    return {
      ok: true,
      status: response.status,
      data: payload as T,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: normalizeErrorMessage(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
