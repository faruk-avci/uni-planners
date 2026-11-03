import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { request } from './api.js'

function AuthCard({ title, lead, children }) {
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="brand-mark">U</div>
        <h1>{title}</h1>
        {lead && <p className="muted">{lead}</p>}
        {children}
      </div>
    </main>
  )
}

function CodeInput({ value, onChange }) {
  return (
    <label>
      Doğrulama kodu
      <input
        value={value}
        onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        placeholder="6 haneli kod"
        autoFocus
      />
    </label>
  )
}

// Two-factor enrolment: scan the QR (or type the key), confirm with a code.
function Enroll({ enrolment, onDone, onRestart }) {
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    QRCode.toDataURL(enrolment.otpauthUrl, { margin: 1, width: 200, color: { dark: '#201b18', light: '#fcfbf9' } }).then(setQr).catch(() => setQr(''))
  }, [enrolment.otpauthUrl])

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onDone(await request('/login/enroll', { method: 'POST', body: { ticket: enrolment.ticket, code } }))
    } catch (err) {
      setError(err.message)
      setCode('')
      if (err.data?.restart) onRestart(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="İki adımlı doğrulama" lead="Panel her girişte telefonunuzdaki doğrulayıcı uygulamanın kodunu ister. Google Authenticator, Microsoft Authenticator, 1Password veya benzeri bir uygulamayla aşağıdaki kodu okutun.">
      <form onSubmit={submit} className="auth-form">
        <div className="enroll-qr">
          {qr ? <img src={qr} alt="Doğrulayıcı uygulama için QR kod" width="200" height="200" /> : <div className="enroll-qr-placeholder">QR hazırlanıyor…</div>}
        </div>
        <details className="enroll-manual">
          <summary>QR okutamıyor musunuz? Anahtarı elle girin</summary>
          <code>{enrolment.secret.match(/.{1,4}/g).join(' ')}</code>
        </details>
        <CodeInput value={code} onChange={setCode} />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="primary-button" disabled={busy || code.length !== 6}>{busy ? 'Doğrulanıyor…' : 'Doğrula ve giriş yap'}</button>
      </form>
    </AuthCard>
  )
}

export function Login({ onSignedIn, initialMessage = '' }) {
  const [step, setStep] = useState({ name: 'password' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState(initialMessage)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => { request('/auth/status').then(setStatus).catch(() => {}) }, [])

  const restart = message => {
    setStep({ name: 'password' })
    setPassword('')
    setCode('')
    setError(message)
  }

  const submitPassword = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await request('/login', { method: 'POST', body: { email, password } })
      setPassword('')
      setStep(result.next === 'enroll' ? { name: 'enroll', enrolment: result } : { name: 'totp', ticket: result.ticket })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onSignedIn(await request('/login/totp', { method: 'POST', body: { ticket: step.ticket, code } }))
    } catch (err) {
      setCode('')
      if (err.data?.restart) restart(err.message)
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (step.name === 'enroll') return <Enroll enrolment={step.enrolment} onDone={onSignedIn} onRestart={restart} />

  if (step.name === 'totp') {
    return (
      <AuthCard title="Doğrulama kodu" lead="Doğrulayıcı uygulamanızdaki 6 haneli UniPlanners Panel kodunu girin.">
        <form onSubmit={submitCode} className="auth-form">
          <CodeInput value={code} onChange={setCode} />
          {error && <div className="alert alert-error">{error}</div>}
          <button className="primary-button" disabled={busy || code.length !== 6}>{busy ? 'Kontrol ediliyor…' : 'Giriş yap'}</button>
          <button type="button" className="link-button" onClick={() => restart('')}>Farklı bir hesapla giriş yap</button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Yönetim paneli" lead="Size tanımlanan e-posta adresi ve parolanızla giriş yapın.">
      {status && !status.hasUsers && (
        <div className="alert alert-error">Henüz panel hesabı yok. İlk süper yönetici sunucuda <code>node scripts/create-admin.mjs e-posta</code> komutuyla oluşturulur.</div>
      )}
      <form onSubmit={submitPassword} className="auth-form">
        <label>
          E-posta
          <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          Parola
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="primary-button" disabled={busy || !email || !password}>{busy ? 'Kontrol ediliyor…' : 'Devam et'}</button>
      </form>
    </AuthCard>
  )
}

// One-time setup link: choose a password, then enrol two-factor.
export function Setup({ token, onSignedIn, onCancel }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [enrolment, setEnrolment] = useState(null)

  useEffect(() => {
    request('/setup/info', { method: 'POST', body: { token } }).then(setInfo).catch(err => setError(err.message))
  }, [token])

  const submit = async event => {
    event.preventDefault()
    if (password !== confirm) {
      setError('Parolalar aynı değil.')
      return
    }
    setBusy(true)
    setError('')
    try {
      setEnrolment(await request('/setup', { method: 'POST', body: { token, password } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (enrolment) return <Enroll enrolment={enrolment} onDone={onSignedIn} onRestart={message => { setEnrolment(null); setError(`${message} Kurulum bağlantısı kullanıldı; giriş ekranından parolanızla devam edin.`) }} />

  if (!info) {
    return (
      <AuthCard title="Hesap kurulumu" lead={error || 'Bağlantı kontrol ediliyor…'}>
        {error && <button className="primary-button" onClick={onCancel}>Giriş ekranına dön</button>}
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Hesabınızı kurun" lead={`${info.email} için bir parola belirleyin. Ardından iki adımlı doğrulamayı kuracaksınız.`}>
      <form onSubmit={submit} className="auth-form">
        <input type="email" value={info.email} autoComplete="username" readOnly hidden />
        <label>
          Yeni parola
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={12} autoFocus required />
          <small>En az 12 karakter. Bir cümle veya birkaç kelime iyi bir seçimdir.</small>
        </label>
        <label>
          Parolayı tekrar girin
          <input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" required />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="primary-button" disabled={busy || password.length < 12 || !confirm}>{busy ? 'Kaydediliyor…' : 'Parolayı kaydet'}</button>
      </form>
    </AuthCard>
  )
}
