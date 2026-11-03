import { useEffect, useState } from 'react'
import { request, formatDate } from '../api.js'
import { Notice, PageHeader, ReadOnlyNote, Section, useLoad } from '../ui.jsx'

const EMPTY = { catalogTerm: '', surveyUrl: '', announcementUrl: '', catalogNotice: '', catalogNoticeUpdatedAt: '' }
const FIELDS = ['catalogTerm', 'surveyUrl', 'announcementUrl', 'catalogNotice']

export default function UniversitySettings({ university, role }) {
  const path = `/u/${university.slug}/site-settings`
  const { data, error, setData } = useLoad(() => request(path), [university.slug])
  const [draft, setDraft] = useState(EMPTY)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const canEdit = role === 'editor'

  useEffect(() => { if (data) setDraft({ ...EMPTY, ...data }) }, [data])
  useEffect(() => setNotice(null), [university.slug])

  const changed = data && FIELDS.some(key => (draft[key] || '') !== (data[key] || ''))
  const set = key => event => setDraft(current => ({ ...current, [key]: event.target.value }))

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const saved = await request(path, { method: 'PUT', body: draft })
      setData(saved)
      setNotice({ type: 'success', text: `${university.shortName} ayarları yayınlandı. Ziyaretçiler bir sonraki açılışta görecek.` })
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Site ayarları" subtitle={`${university.name} sayfalarında görünen dönem, anket, duyuru ve bildirim. Diğer üniversiteleri etkilemez.`} />
      <ReadOnlyNote role={role} />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={save}>
        <fieldset disabled={!canEdit || !data} className="plain-fieldset">
          <Section icon="settings" title="Dönem ve bağlantılar" description={`uniplanners.org/${university.slug} üzerinde kullanılır.`}>
            <div className="settings-grid two">
              <label className="select-field">
                <span>Gösterilen dönem</span>
                <input value={draft.catalogTerm} maxLength={60} onChange={set('catalogTerm')} placeholder="2026-2027 Güz" required />
                <small>Arama alanında ve paylaşılan programlarda görünür.</small>
              </label>
              <label className="select-field">
                <span>Anket bağlantısı</span>
                <input type="url" value={draft.surveyUrl} maxLength={500} onChange={set('surveyUrl')} placeholder={`https://uniplanners.org/${university.slug}/anket`} />
                <small>Boş bırakılırsa menüdeki Anket bağlantısı gizlenir. Anketin kendisi Anket sayfasından yönetilir.</small>
              </label>
              <label className="select-field settings-wide">
                <span>Duyuru bağlantısı</span>
                <input type="url" value={draft.announcementUrl} maxLength={500} onChange={set('announcementUrl')} placeholder="https://..." />
                <small>Doluysa üniversite kutusunun yanında bir duyuru bağlantısı görünür.</small>
              </label>
            </div>
          </Section>
          <Section icon="survey" title="Katalog bildirimi" description="Üniversite kutusunun altında, kapatılabilir bir bildirim olarak görünür.">
            <label className="select-field">
              <textarea value={draft.catalogNotice} maxLength={500} rows={3} onChange={set('catalogNotice')} placeholder="Örn: HUM 319 ve ARCH 212 ders saatleri değişti; PHYS 221 kaldırıldı." />
              <small>
                Metni değiştirdiğinizde, daha önce kapatmış ziyaretçilere de yeniden gösterilir. Boş bırakırsanız bildirim kalkar.
                {data?.catalogNoticeUpdatedAt && <> Son değişiklik: {formatDate(data.catalogNoticeUpdatedAt)}.</>}
              </small>
            </label>
            {draft.catalogNotice && <div className="notice-preview"><span>Önizleme</span><p>{draft.catalogNotice}</p></div>}
          </Section>
          {canEdit && (
            <div className="sticky-save">
              <span className="muted">{data?.updatedAt ? `Son kaydeden: ${data.updatedBy || '—'} · ${formatDate(data.updatedAt)}` : 'Henüz panelden kaydedilmedi.'}</span>
              <div className="settings-actions">
                <button type="button" className="secondary-button" disabled={!changed} onClick={() => setDraft({ ...EMPTY, ...data })}>Geri al</button>
                <button className="primary-button" disabled={busy || !changed || !draft.catalogTerm.trim()}>{busy ? 'Kaydediliyor…' : 'Yayınla'}</button>
              </div>
            </div>
          )}
        </fieldset>
      </form>
    </>
  )
}
