import { useEffect, useState } from 'react'
import { request, formatDate } from '../api.js'
import { Notice, PageHeader, Section, useLoad } from '../ui.jsx'

const FONTS = [
  ['grotesk', 'Schibsted Grotesk (önerilen)', '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif'],
  ['system', 'Sistem', 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'],
  ['inter', 'Inter', 'Inter, -apple-system, "Segoe UI", sans-serif'],
  ['arial', 'Arial', 'Arial, Helvetica, sans-serif'],
  ['rounded', 'Yuvarlak', '"Trebuchet MS", ui-rounded, system-ui, sans-serif'],
]

export default function GlobalSettings() {
  const { data, error, setData } = useLoad(() => request('/global-settings'), [])
  const [font, setFont] = useState('grotesk')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  useEffect(() => { if (data) setFont(data.mainFont) }, [data])

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      setData(await request('/global-settings', { method: 'PUT', body: { mainFont: font } }))
      setNotice({ type: 'success', text: 'Yazı tipi tüm üniversite sayfalarında yayınlandı.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Genel ayarlar" subtitle="Tüm site için geçerli ayarlar. Üniversiteye özel dönem, anket ve duyurular her üniversitenin kendi Site ayarları sayfasındadır." />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={save}>
        <Section icon="globe" title="Ana sitenin yazı tipi" description="Planlayıcı, müfredat ve diğer sayfalara uygulanır; paneli etkilemez.">
          <div className="font-options">
            {FONTS.map(([value, label, family]) => (
              <label key={value} className={`font-option ${font === value ? 'active' : ''}`}>
                <input type="radio" name="font" value={value} checked={font === value} onChange={() => setFont(value)} />
                <span>{label}</span>
                <strong style={{ fontFamily: family }}>Programını planla</strong>
              </label>
            ))}
          </div>
          <div className="sticky-save">
            <span className="muted">{data?.updatedAt ? `Son kaydeden: ${data.updatedBy || '—'} · ${formatDate(data.updatedAt)}` : ''}</span>
            <button className="primary-button" disabled={busy || !data || font === data.mainFont}>{busy ? 'Kaydediliyor…' : 'Yayınla'}</button>
          </div>
        </Section>
      </form>
    </>
  )
}
