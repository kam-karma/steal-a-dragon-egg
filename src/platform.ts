/**
 * Which portal's ad SDK the game talks to. Each portal gets its own build
 * (`VITE_PLATFORM`), because a portal rejects a game that carries another portal's SDK.
 */
export type Platform = 'poki' | 'crazygames' | 'none'

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/

/**
 * `target` is the build's VITE_PLATFORM. A Poki build run locally uses the fake ad,
 * since Poki's test ads report "not watched"; `?pokisdk=1` asks for the real SDK.
 */
export function pickPlatform(target: string | undefined, hostname: string, search: string): Platform {
  if (target === 'crazygames') return 'crazygames'
  const local = LOCAL_HOST.test(hostname)
  if (local && !new URLSearchParams(search).has('pokisdk')) return 'none'
  return 'poki'
}
