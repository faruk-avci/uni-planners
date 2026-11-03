const API = '/api/admin'

// Every non-GET request carries X-Panel-Request: the API refuses state changes
// without it, which a cross-site form cannot add.
export async function request(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const init = { method, credentials: 'include', headers: { ...headers } }
  if (method !== 'GET') init.headers['X-Panel-Request'] = '1'
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`${API}${path}`, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    // A session that expired mid-use sends everyone back to sign-in.
    if (response.status === 401 && !path.startsWith('/login') && !path.startsWith('/setup')) {
      window.dispatchEvent(new Event('panel:signed-out'))
    }
    const error = new Error(data.error || 'İstek tamamlanamadı')
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export const go = path => { window.location.hash = path }

export const formatDate = value => (value ? new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
export const formatDay = value => (value ? new Date(value).toLocaleDateString('tr-TR', { dateStyle: 'medium' }) : '—')
