import { useState } from 'react'
import { request, formatDate } from '../api.js'
import { PageHeader, useLoad } from '../ui.jsx'

const ACTIONS = {
  login: 'Giriş yaptı',
  login_failed: 'Başarısız giriş',
  totp_enrolled: 'İki adımlı doğrulamayı kurdu',
  account_setup: 'Hesabını kurdu',
  password_changed: 'Parolasını değiştirdi',
  sessions_revoked: 'Diğer oturumlarını kapattı',
  user_created: 'Kullanıcı oluşturdu',
  user_created_cli: 'Sunucudan süper yönetici oluşturuldu',
  user_updated: 'Kullanıcıyı güncelledi',
  user_reset: 'Kullanıcıyı sıfırladı',
  user_reset_cli: 'Sunucudan hesap sıfırlandı',
  user_deleted: 'Kullanıcıyı sildi',
  global_settings_saved: 'Genel ayarları değiştirdi',
  site_settings_saved: 'Site ayarlarını değiştirdi',
  survey_saved: 'Anketi kaydetti',
  survey_exported: 'Anket sonuçlarını indirdi',
  curriculum_saved: 'Müfredat yayınladı',
  elective_pool_saved: 'Seçmeli havuzu kaydetti',
}

const FIELD_LABELS = { catalogTerm: 'dönem', surveyUrl: 'anket bağlantısı', announcementUrl: 'duyuru bağlantısı', catalogNotice: 'bildirim' }

function describe(entry) {
  const d = entry.details || {}
  switch (entry.action) {
    case 'site_settings_saved': return d.changed?.length ? d.changed.map(key => FIELD_LABELS[key] || key).join(', ') : 'değişiklik yok'
    case 'survey_saved': return `v${d.version}${d.newVersion ? ' (yeni sürüm)' : ''} · ${d.questions} soru · ${d.active ? 'açık' : 'kapalı'}`
    case 'survey_exported': return `v${d.version} · ${d.rows} satır`
    case 'user_created': return `${d.email} · ${d.isSuperadmin ? 'süper yönetici' : Object.entries(d.access || {}).map(([u, r]) => `${u}: ${r}`).join(', ')}`
    case 'user_updated': return [d.email, d.disabled === true && 'devre dışı', d.disabled === false && 'etkin', d.isSuperadmin === true && 'süper yönetici', d.access && Object.entries(d.access).map(([u, r]) => `${u}: ${r}`).join(', ')].filter(Boolean).join(' · ')
    case 'user_reset':
    case 'user_deleted': return d.email
    case 'login_failed': return d.step === 'totp' ? 'yanlış doğrulama kodu' : 'yanlış parola'
    case 'curriculum_saved': return `${d.id} · ${d.courses} ders`
    case 'elective_pool_saved': return `${d.key} · ${d.courses} ders`
    case 'global_settings_saved': return d.mainFont ? `yazı tipi ${d.mainFont[0]} → ${d.mainFont[1]}` : ''
    default: return ''
  }
}

// Global audit log (superadmin) or one university's activity.
export default function Audit({ university = null, universities = [] }) {
  const [filter, setFilter] = useState('')
  const path = university ? `/u/${university.slug}/audit` : `/audit${filter ? `?university=${filter}` : ''}`
  const { data, error, loading, reload } = useLoad(() => request(path), [path])

  return (
    <>
      <PageHeader
        title={university ? 'Etkinlik kaydı' : 'Denetim kaydı'}
        subtitle={university ? `${university.name} için panelde yapılan değişiklikler.` : 'Paneldeki tüm girişler ve değişiklikler: kim, ne zaman, ne yaptı.'}
      >
        {!university && (
          <select className="compact-select" value={filter} onChange={event => setFilter(event.target.value)} aria-label="Üniversite">
            <option value="">Tümü</option>
            {universities.map(item => <option key={item.slug} value={item.slug}>{item.shortName}</option>)}
          </select>
        )}
        <button className="secondary-button" onClick={reload} disabled={loading}>{loading ? 'Yükleniyor…' : 'Yenile'}</button>
      </PageHeader>
      {error && <div className="alert alert-error">{error}</div>}
      <section className="content-card">
        {data?.entries.length === 0 ? <p className="empty-note">Henüz kayıt yok.</p> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Zaman</th><th>Kişi</th><th>İşlem</th>{!university && <th>Üniversite</th>}<th>Ayrıntı</th></tr></thead>
              <tbody>
                {data?.entries.map(entry => (
                  <tr key={entry.id} className={entry.action === 'login_failed' ? 'row-warn' : ''}>
                    <td className="nowrap">{formatDate(entry.created_at)}</td>
                    <td>{entry.email || '—'}</td>
                    <td>{ACTIONS[entry.action] || entry.action}</td>
                    {!university && <td>{entry.university || '—'}</td>}
                    <td className="details-cell">{describe(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
