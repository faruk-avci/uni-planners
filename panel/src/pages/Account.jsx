import { useState } from 'react'
import { request } from '../api.js'
import { Notice, PageHeader, RoleBadge, Section } from '../ui.jsx'

export default function Account({ user }) {
  const [form, setForm] = useState({ currentPassword: '', password: '', confirm: '', code: '' })
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const set = key => event => setForm(current => ({ ...current, [key]: key === 'code' ? event.target.value.replace(/\D/g, '').slice(0, 6) : event.target.value }))

  const changePassword = async event => {
    event.preventDefault()
    if (form.password !== form.confirm) {
      setNotice({ type: 'error', text: 'Yeni parolalar aynı değil.' })
      return
    }
    setBusy('password')
    setNotice(null)
    try {
      await request('/me/password', { method: 'POST', body: { currentPassword: form.currentPassword, password: form.password, code: form.code } })
      setForm({ currentPassword: '', password: '', confirm: '', code: '' })
      setNotice({ type: 'success', text: 'Parolanız değişti. Diğer cihazlardaki oturumlarınız kapatıldı.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  const revokeOthers = async () => {
    setBusy('sessions')
    setNotice(null)
    try {
      await request('/me/sessions/revoke-others', { method: 'POST' })
      setNotice({ type: 'success', text: 'Bu tarayıcı dışındaki tüm oturumlarınız kapatıldı.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHeader title="Hesabım" subtitle={user.email} />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <Section icon="account" title="Yetkileriniz">
        {user.isSuperadmin ? <p><RoleBadge role="superadmin" /> Tüm üniversitelere ve yönetim sayfalarına erişiminiz var.</p> : (
          <ul className="plain-list">
            {Object.entries(user.access).map(([slug, role]) => <li key={slug}><strong>{slug}</strong> <RoleBadge role={role} /></li>)}
          </ul>
        )}
        <p className="muted small">Yetki değişikliği için süper yöneticiye başvurun.</p>
      </Section>
      <form onSubmit={changePassword}>
        <Section icon="shield" title="Parolayı değiştir" description="Mevcut parolanız ve doğrulayıcı uygulamanızdaki güncel kod gerekir.">
          <div className="settings-grid two">
            <label className="select-field"><span>Mevcut parola</span><input type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" required /></label>
            <label className="select-field"><span>Doğrulama kodu</span><input value={form.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" placeholder="6 haneli kod" required /></label>
            <label className="select-field"><span>Yeni parola</span><input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={12} required /><small>En az 12 karakter.</small></label>
            <label className="select-field"><span>Yeni parola (tekrar)</span><input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required /></label>
          </div>
          <div className="form-actions"><button className="primary-button" disabled={busy === 'password' || form.code.length !== 6}>{busy === 'password' ? 'Değiştiriliyor…' : 'Parolayı değiştir'}</button></div>
        </Section>
      </form>
      <Section icon="activity" title="Oturumlar" description="Panel oturumları 2 saat işlem yapılmazsa, en geç 12 saat sonra kapanır.">
        <button className="secondary-button" onClick={revokeOthers} disabled={busy === 'sessions'}>Diğer tüm oturumlarımı kapat</button>
      </Section>
      <Section icon="shield" title="Doğrulayıcı uygulama" description="Telefonunuzu kaybederseniz süper yönetici hesabınızı sıfırlayabilir; size yeni bir kurulum bağlantısı verir.">
        <p className="muted small">Kurtarma için süper yöneticiye başvurun. Süper yöneticiler sunucuda <code>node scripts/create-admin.mjs e-posta --reset</code> ile kendi hesaplarını kurtarabilir.</p>
      </Section>
    </>
  )
}
