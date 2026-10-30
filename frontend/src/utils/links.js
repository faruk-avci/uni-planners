// Links to pages on this site open in the same tab; anything else (Google
// Forms, the university's site) opens in a new one.
export function isExternalUrl(url) {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin
  } catch {
    return true
  }
}

export function linkTargetProps(url) {
  return isExternalUrl(url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}
