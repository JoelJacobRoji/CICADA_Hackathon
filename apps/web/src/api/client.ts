// Same-origin JSON client. The session lives in an httpOnly cookie; JS never sees the token.
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (res.status === 401) {
    onUnauthorized?.()
    throw new ApiError(401, 'Not signed in')
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') msg = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
