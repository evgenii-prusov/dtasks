/**
 * Where to send the user after they log in, for pages reached from outside the
 * app (the MCP consent page). sessionStorage rather than a URL param so it
 * survives the Google/GitHub round trip, which always lands back on `/`.
 */
const KEY = 'dtasks.returnTo'

export function rememberReturnTo(path: string): void {
  sessionStorage.setItem(KEY, path)
}

/** The remembered path, cleared as it is read. Only same-origin paths are honoured. */
export function takeReturnTo(): string | null {
  const path = sessionStorage.getItem(KEY)
  sessionStorage.removeItem(KEY)
  return path?.startsWith('/') && !path.startsWith('//') ? path : null
}
