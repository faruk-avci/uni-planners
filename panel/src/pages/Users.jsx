import { useState } from 'react'
import { request, formatDate } from '../api.js'
import { CopyField, Notice, PageHeader, RoleBadge, Section, useLoad } from '../ui.jsx'

const ROLE_OPTIONS = [['', 'Yok'], ['viewer', 'Görüntüleyici'], ['editor', 'Düzenleyici']]

function AccessMatrix({ universities, access, onChange, disabled }) {
  return (
    <div className="access-matrix">
      {universities.map(university => (
        <div className="access-row" key={university.slug}>
          <strong>{university.name}</strong>
          <div className="segmented" role="radiogroup" aria-label={`${university.name} yetkisi`}>
            {ROLE_OPTIONS.map(([value, label]) => (
              <button
                type="button"
                key={value || 'none'}
                role="radio"
                aria-checked={(access[university.slug] || '') === value}
                className={(access[university.slug] || '') === value ? 'active' : ''}
                disabled={disabled}
                onClick={() => {
                  const next = { ...access }
                  if (value) next[university.slug] = value
                  else delete next[university.slug]
                  onChange(next)
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      ))}
      <p className="matrix-help"><strong>Görüntüleyici</strong> ayarları, anketi, sonuçları ve müfredatları görür. <strong>Düzenleyici</strong> bunları değiştirebilir. Kimse yetkisi olmayan bir üniversitenin verisine ulaşamaz.</p>
    </div>
  )
}

function UserForm({ universities, initial, onSubmit, onCancel, submitLabel, isSelf = false }) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await onSubmit(form) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <form className="user-form" onSubmit={submit}>
      <div className="settings-grid two">
        <label className="select-field"><span>E-posta</span><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required disabled={!initial.isNew} autoComplete="off" /></label>
        <label className="select-field"><span>Ad soyad (isteğe bağlı)</span><input value={form.displayName} maxLength={120} onChange={event => setForm({ ...form, displayName: event.target.value })} placeholder="Örn. Bilkent Öğrenci İşleri" /></label>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={form.isSuperadmin} disabled={isSelf} onChange={event => setForm({ ...form, isSuperadmin: event.target.checked })} />
        <span><strong>Süper yönetici</strong><small>Tüm üniversiteleri, kullanıcıları ve denetim kaydını yönetir. Yalnızca güvendiğiniz kişilere verin.</small></span>
      </label>
      {!form.isSuperadmin && <AccessMatrix universities={universities} access={form.access} onChange={access => setForm({ ...form, access })} />}
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Vazgeç</button>
        <button className="primary-button" disabled={busy || (!form.isSuperadmin && !Object.keys(form.access).length)}>{busy ? 'Kaydediliyor…' : submitLabel}</button>
      </div>
    </form>
  )
}

function SetupLinkDialog({ link, onClose }) {
  const url = `${window.location.origin}/#/setup/${link.token}`
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-link-title">
      <div className="modal">
        <h2 id="setup-link-title">Kurulum bağlantısı</h2>
        <p className="muted"><strong>{link.email}</strong> bu bağlantıyla kendi parolasını belirleyip iki adımlı doğrulamayı kurar. Bağlantı <strong>72 saat</strong> geçerli ve tek kullanımlıktır; yalnızca bir kez gösterilir.</p>
        <CopyField value={url} />
        <p className="modal-warning">Bağlantıyı yalnızca o kişiye, güvenli bir kanaldan iletin. Bağlantıya sahip olan herkes hesabı kurabilir.</p>
        <div className="form-actions"><button className="primary-button" onClick={onClose}>Tamam</button></div>
      </div>
    </div>
  )
}

const statusOf = user => {
  if (user.disabled) return ['Devre dışı', 'pill-muted']
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return ['Kilitli', 'pill-warn']
  if (user.setupPending) return ['Kurulum bekliyor', 'pill-warn']
  if (!user.totpEnabled) return ['2FA kurulmadı', 'pill-warn']
  return ['Aktif', 'pill-ok']
}

export default function Users({ me }) {
  const { data, error, reload } = useLoad(() => request('/users'), [])
  const [mode, setMode] = useState(null) // { kind: 'new' } | { kind: 'edit', user }
  const [link, setLink] = useState(null)
  const [notice, setNotice] = useState(null)
  const universities = data?.universities || []

  const create = async form => {
    const result = await request('/users', { method: 'POST', body: form })
    setMode(null)
    setLink({ email: result.user.email, token: result.setupToken })
    await reload()
  }

  const update = async form => {
    await request(`/users/${mode.user.id}`, { method: 'PATCH', body: { displayName: form.displayName, isSuperadmin: form.isSuperadmin, access: form.isSuperadmin ? {} : form.access } })
    setMode(null)
    setNotice({ type: 'success', text: `${form.email} güncellendi.` })
    await reload()
  }

  const act = async (user, action) => {
    setNotice(null)
    try {
      if (action === 'reset') {
        if (!window.confirm(`${user.email} hesabı sıfırlansın mı? Parolası ve iki adımlı doğrulaması silinir, tüm oturumları kapanır ve yeni bir kurulum bağlantısı oluşturulur.`)) return
        const result = await request(`/users/${user.id}/reset`, { method: 'POST' })
        setLink({ email: user.email, token: result.setupToken })
      } else if (action === 'toggle') {
        await request(`/users/${user.id}`, { method: 'PATCH', body: { disabled: !user.disabled } })
        setNotice({ type: 'success', text: user.disabled ? `${user.email} yeniden etkin.` : `${user.email} devre dışı bırakıldı; açık oturumları kapandı.` })
      } else if (action === 'delete') {
        if (!window.confirm(`${user.email} kalıcı olarak silinsin mi? Denetim kaydındaki geçmişi korunur.`)) return
        await request(`/users/${user.id}`, { method: 'DELETE' })
        setNotice({ type: 'success', text: `${user.email} silindi.` })
      }
      await reload()
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    }
  }

  return (
    <>
      <PageHeader title="Kullanıcılar ve yetkiler" subtitle="Panel hesapları ve hangi üniversiteye erişebilecekleri. Herkes iki adımlı doğrulamayla giriş yapar.">
        {!mode && <button className="primary-button" onClick={() => setMode({ kind: 'new' })}>+ Yeni kullanıcı</button>}
      </PageHeader>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {error && <div className="alert alert-error">{error}</div>}

      {mode?.kind === 'new' && (
        <Section icon="users" title="Yeni kullanıcı" description="Hesap parolasız açılır; kişi size ilettiğiniz kurulum bağlantısıyla parolasını kendisi belirler.">
          <UserForm universities={universities} initial={{ isNew: true, email: '', displayName: '', isSuperadmin: false, access: {} }} onSubmit={create} onCancel={() => setMode(null)} submitLabel="Hesabı oluştur" />
        </Section>
      )}
      {mode?.kind === 'edit' && (
        <Section icon="users" title={`Düzenle: ${mode.user.email}`}>
          <UserForm universities={universities} initial={{ email: mode.user.email, displayName: mode.user.displayName, isSuperadmin: mode.user.isSuperadmin, access: mode.user.access }} onSubmit={update} onCancel={() => setMode(null)} submitLabel="Kaydet" isSelf={mode.user.id === me.id} />
        </Section>
      )}

      <section className="content-card">
        <div className="table-scroll">
          <table className="data-table users-table">
            <thead><tr><th>Kullanıcı</th><th>Yetki</th><th>Durum</th><th>Son giriş</th><th /></tr></thead>
            <tbody>
              {data?.users.map(user => {
                const [status, tone] = statusOf(user)
                const self = user.id === me.id
                return (
                  <tr key={user.id} className={user.disabled ? 'row-muted' : ''}>
                    <td><strong>{user.displayName || user.email}</strong>{user.displayName && <small>{user.email}</small>}{self && <small className="you">siz</small>}</td>
                    <td>
                      {user.isSuperadmin ? <RoleBadge role="superadmin" /> : (
                        <div className="badge-list">
                          {Object.entries(user.access).map(([slug, role]) => (
                            <span key={slug} className={`role-badge role-${role}`}>{universities.find(u => u.slug === slug)?.shortName || slug} · {role === 'editor' ? 'düzenler' : 'görür'}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><span className={`pill ${tone}`}>{status}</span>{user.setupPending && user.setupExpiresAt && <small>bağlantı {formatDate(user.setupExpiresAt)} tarihine kadar</small>}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td className="row-actions">
                      <button className="link-button" onClick={() => setMode({ kind: 'edit', user })}>Düzenle</button>
                      {!self && <button className="link-button" onClick={() => act(user, 'reset')}>Sıfırla</button>}
                      {!self && <button className="link-button" onClick={() => act(user, 'toggle')}>{user.disabled ? 'Etkinleştir' : 'Devre dışı bırak'}</button>}
                      {!self && <button className="link-button danger" onClick={() => act(user, 'delete')}>Sil</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      {link && <SetupLinkDialog link={link} onClose={() => setLink(null)} />}
    </>
  )
}
