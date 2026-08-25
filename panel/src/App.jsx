import { useEffect, useMemo, useRef, useState } from 'react'

const API = '/api/admin'
const DEFAULT_SITE_SETTINGS = { mainFont: 'system', catalogTerm: '2025-2026 Yaz', surveyUrl: '' }
const FONT_PREVIEWS = {
  system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inter: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  rounded: '"Trebuchet MS", ui-rounded, system-ui, sans-serif',
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'İstek tamamlanamadı')
    error.status = response.status
    throw error
  }
  return data
}

const termLabel = term => term === 'fall' ? 'Güz' : 'Bahar'
const countCourses = curriculum => Object.values(curriculum?.semesters || {}).reduce(
  (sum, terms) => sum + (terms.fall?.length || 0) + (terms.spring?.length || 0), 0
)

function Login({ onLogin }) {
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">U</div>
        <p className="eyebrow">UNIPLANNER</p>
        <h1>Yönetim paneli</h1>
        <p className="muted">Devam etmek için sunucudaki yönetici anahtarını girin.</p>
        <label>
          Yönetici anahtarı
          <input type="password" value={secret} onChange={event => setSecret(event.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="primary-button" disabled={busy || !secret}>{busy ? 'Kontrol ediliyor…' : 'Panele gir'}</button>
      </form>
    </main>
  )
}

function FilePicker({ label, hint, onFile, busy, compact = false, disabled = false }) {
  const input = useRef(null)
  return (
    <button type="button" className={`file-picker ${compact ? 'file-picker-compact' : ''}`} onClick={() => input.current?.click()} disabled={busy || disabled}>
      <span className="file-picker-icon">↑</span>
      <span><strong>{busy ? 'Dosya okunuyor…' : label}</strong><small>{hint}</small></span>
      <input ref={input} type="file" accept=".xls,.xlsx" onChange={event => {
        const file = event.target.files?.[0]
        if (file) onFile(file)
        event.target.value = ''
      }} />
    </button>
  )
}

function CurriculumPreview({ curriculum, onClose }) {
  if (!curriculum) return null
  const refs = curriculum.electivePoolRefs || {}
  return (
    <section className="preview-panel">
      <header className="preview-header">
        <div>
          <p className="eyebrow">MÜFREDAT ÖNİZLEMESİ</p>
          <h2>{curriculum.title_tr}</h2>
          <p className="muted">{curriculum.programCodes?.join(' / ')} · {countCourses(curriculum)} satır</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Kapat">×</button>
      </header>
      <div className="year-list">
        {Object.entries(curriculum.semesters || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([year, terms]) => (
          <div className="year-block" key={year}>
            <h3>{year}. Yıl</h3>
            <div className="term-grid">
              {['fall', 'spring'].map(term => (
                <div className="term-card" key={term}>
                  <div className="term-title"><strong>{termLabel(term)}</strong><span>{terms[term]?.length || 0} ders</span></div>
                  <div className="preview-courses">
                    {(terms[term] || []).map((course, index) => (
                      <div className={`preview-course ${course.code ? '' : 'preview-elective'}`} key={`${course.code}-${course.electiveType}-${index}`}>
                        <span className="course-code">{course.code || 'SEÇMELİ'}</span>
                        <span className="course-title">{course.title_tr}</span>
                        <span className="course-credit">{course.credits} AKTS</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {Object.keys(refs).length > 0 && (
        <div className="preview-pools">
          <h3>Bağlı seçmeli listeleri</h3>
          {Object.entries(refs).map(([type, pool]) => <span className="pool-pill" key={type}>{curriculum.electiveLabels?.[type] || type} → {pool}</span>)}
        </div>
      )}
    </section>
  )
}

function Dashboard({ onLogout }) {
  const [programData, setProgramData] = useState({ faculties: [], programs: [] })
  const [curricula, setCurricula] = useState([])
  const [pools, setPools] = useState([])
  const [programId, setProgramId] = useState('')
  const [draft, setDraft] = useState(null)
  const [sourceFile, setSourceFile] = useState('')
  const [mappings, setMappings] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [preview, setPreview] = useState(null)
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SITE_SETTINGS)

  const selectedProgram = programData.programs.find(program => program.id === programId)
  const groupedPrograms = useMemo(() => programData.faculties.map(faculty => ({
    ...faculty,
    programs: programData.programs.filter(program => program.faculty === faculty.id),
  })).filter(group => group.programs.length), [programData])

  const refresh = async () => {
    const [programsResult, curriculaResult, poolsResult, settingsResult] = await Promise.all([
      request('/programs'), request('/curriculums'), request('/elective-pools'), request('/site-settings'),
    ])
    setProgramData(programsResult)
    setCurricula(curriculaResult)
    setPools(poolsResult)
    setSiteSettings(settingsResult)
    setSettingsDraft(settingsResult)
  }

  useEffect(() => { refresh().catch(error => setNotice({ type: 'error', text: error.message })) }, [])

  const inspectCurriculum = async file => {
    setBusy('curriculum')
    setNotice(null)
    try {
      const parsed = await request('/curriculums/inspect-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      })
      const automatic = {}
      for (const requirement of parsed.electiveRequirements) {
        const exact = pools.find(pool => pool.key === requirement.key || pool.label.toLocaleLowerCase('tr-TR') === requirement.label.toLocaleLowerCase('tr-TR'))
        if (exact) automatic[requirement.key] = exact.key
      }
      setDraft(parsed)
      setMappings(automatic)
      setSourceFile(file.name)
      setNotice({ type: 'success', text: `${parsed.courseCount} ders ve ${parsed.electiveRequirements.length} seçmeli türü bulundu.` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  const uploadElective = async (requirement, file) => {
    setBusy(`elective:${requirement.key}`)
    setNotice(null)
    try {
      const parsed = await request('/elective-pools/inspect-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      })
      const saved = await request(`/elective-pools/${encodeURIComponent(requirement.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: requirement.label, sourceFile: file.name, courses: parsed.courses }),
      })
      setPools(current => [...current.filter(pool => pool.key !== saved.key), saved].sort((a, b) => a.label.localeCompare(b.label, 'tr')))
      setMappings(current => ({ ...current, [requirement.key]: saved.key }))
      setNotice({ type: 'success', text: `${requirement.label}: ${saved.courseCount} ders kaydedildi.` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  const saveCurriculum = async () => {
    if (!programId || !draft) return
    setBusy('save')
    setNotice(null)
    try {
      const saved = await request(`/curriculums/${encodeURIComponent(programId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, electivePoolRefs: mappings, sourceFile }),
      })
      await refresh()
      setPreview(saved)
      setDraft(null)
      setMappings({})
      setSourceFile('')
      setNotice({ type: 'success', text: `${selectedProgram?.tr || programId} müfredatı yayınlandı.` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  const openPreview = async id => {
    setBusy(`preview:${id}`)
    try { setPreview(await request(`/curriculums/${encodeURIComponent(id)}`)) }
    catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy('') }
  }

  const saveSiteSettings = async event => {
    event.preventDefault()
    setBusy('settings')
    setNotice(null)
    try {
      const saved = await request('/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsDraft),
      })
      setSiteSettings(saved)
      setSettingsDraft(saved)
      setNotice({ type: 'success', text: 'Site ayarları yayınlandı. Ana site yeni ayarları bir sonraki açılışta kullanacak.' })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  const missingCount = draft?.electiveRequirements.filter(item => !mappings[item.key]).length || 0

  return (
    <div className="panel-shell">
      <aside className="side-nav">
        <a className="panel-brand" href="/"><span>U</span><strong>UniPlanner</strong><small>Panel</small></a>
        <nav>
          <button className="nav-active" onClick={() => document.getElementById('curriculum-management')?.scrollIntoView({ behavior: 'smooth' })}><span>▦</span>Müfredatlar</button>
          <button onClick={() => document.getElementById('site-settings')?.scrollIntoView({ behavior: 'smooth' })}><span>⚙</span>Site ayarları</button>
        </nav>
        <div className="side-footer"><a href="https://uniplanner.org">Siteye git ↗</a><button onClick={onLogout}>Çıkış yap</button></div>
      </aside>

      <main className="panel-main">
        <header className="page-header">
          <div><p className="eyebrow">İÇERİK YÖNETİMİ</p><h1>Müfredatlar</h1><p className="muted">Ders planlarını ve ortak seçmeli havuzlarını yönetin.</p></div>
          <div className="header-status"><span className="status-dot" />Sunucuya bağlı</div>
        </header>

        {notice && <div className={`alert alert-${notice.type}`}>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}

        <section className="stats-grid">
          <div className="stat-card"><span>Aktif müfredat</span><strong>{curricula.length}</strong><small>Şu anda sitede görünen</small></div>
          <div className="stat-card"><span>Seçmeli havuzu</span><strong>{pools.length}</strong><small>Birden fazla planda kullanılabilir</small></div>
          <div className="stat-card"><span>Toplam ders satırı</span><strong>{curricula.reduce((sum, item) => sum + item.courseCount, 0)}</strong><small>Aktif müfredatlarda</small></div>
        </section>

        <section className="content-card settings-card" id="site-settings">
          <div className="section-heading">
            <div><span className="step-number neutral">⚙</span><div><h2>Site ayarları</h2><p>Kullanıcıların gördüğü ana sitenin görünümünü ve küçük içeriklerini yönetin.</p></div></div>
            <span className="format-chip">CANLI</span>
          </div>
          <form onSubmit={saveSiteSettings}>
            <div className="settings-grid">
              <label className="select-field"><span>Ana sitenin yazı tipi</span><select value={settingsDraft.mainFont} onChange={event => setSettingsDraft(current => ({ ...current, mainFont: event.target.value }))}>
                <option value="system">Sistem</option>
                <option value="inter">Inter (panel yazı tipi)</option>
                <option value="arial">Arial</option>
                <option value="rounded">Yuvarlak</option>
              </select><small>Planlayıcı, Müfredat ve Nasıl Kullanılır sayfalarına uygulanır; panelin fontunu değiştirmez.</small></label>
              <label className="select-field"><span>Gösterilen dönem</span><input value={settingsDraft.catalogTerm} maxLength={60} onChange={event => setSettingsDraft(current => ({ ...current, catalogTerm: event.target.value }))} placeholder="2025-2026 Yaz" required /><small>Arama alanında ve paylaşılan programlarda görünür.</small></label>
              <label className="select-field settings-wide"><span>Anket bağlantısı</span><input type="url" value={settingsDraft.surveyUrl} maxLength={500} onChange={event => setSettingsDraft(current => ({ ...current, surveyUrl: event.target.value }))} placeholder="https://..." /><small>Boş bırakırsanız Anket bağlantısı ana menüden gizlenir.</small></label>
            </div>
            <div className="settings-footer">
              <div className="font-preview" style={{ fontFamily: FONT_PREVIEWS[settingsDraft.mainFont] }}><span>Yazı tipi önizlemesi</span><strong>UniPlanner ile programını planla</strong></div>
              <div className="settings-actions">
                <button type="button" className="secondary-button" disabled={JSON.stringify(siteSettings) === JSON.stringify(settingsDraft)} onClick={() => setSettingsDraft(siteSettings)}>Değişiklikleri geri al</button>
                <button className="primary-button" disabled={busy === 'settings' || !settingsDraft.catalogTerm.trim()}>{busy === 'settings' ? 'Kaydediliyor…' : 'Ayarları yayınla'}</button>
              </div>
            </div>
          </form>
        </section>

        <section className="content-card import-card" id="curriculum-management">
          <div className="section-heading"><div><span className="step-number">1</span><div><h2>Müfredat yükle</h2><p>Bölümü seçin ve SIS ders planı Excel dosyasını yükleyin.</p></div></div><span className="format-chip">.XLS / .XLSX</span></div>
          <div className="import-grid">
            <label className="select-field"><span>Bölüm</span><select value={programId} onChange={event => { setProgramId(event.target.value); setDraft(null); setMappings({}) }}><option value="">Bölüm seçin</option>{groupedPrograms.map(group => <optgroup key={group.id} label={group.tr}>{group.programs.map(program => <option key={program.id} value={program.id}>{program.tr}</option>)}</optgroup>)}</select></label>
            <FilePicker label={sourceFile || 'Ders planı Excel dosyasını seç'} hint="CODE, TITLE, CREDITS ve SEMESTER sütunları okunur" onFile={inspectCurriculum} busy={busy === 'curriculum'} disabled={!programId} />
          </div>
          {!programId && <p className="inline-hint">Önce yüklemenin hangi bölüme ait olduğunu seçin.</p>}
        </section>

        {draft && (
          <section className="content-card requirements-card">
            <div className="section-heading"><div><span className="step-number">2</span><div><h2>Seçmeli listelerini bağla</h2><p>Aynı tür daha önce yüklendiyse listeden seçin; değilse Excel dosyasını bir kez yükleyin.</p></div></div><span className={`mapping-status ${missingCount ? 'mapping-missing' : ''}`}>{missingCount ? `${missingCount} eksik` : 'Tümü hazır'}</span></div>
            <div className="import-summary"><strong>{selectedProgram?.tr}</strong><span>{draft.courseCount} zorunlu ders</span><span>{draft.electiveRequirements.length} benzersiz seçmeli türü</span><span>{sourceFile}</span></div>
            {draft.electiveRequirements.length === 0 ? <div className="empty-note">Bu dosyada boş CODE değerine sahip seçmeli satırı bulunmadı.</div> : (
              <div className="requirement-list">
                {draft.electiveRequirements.map(requirement => {
                  const mapped = mappings[requirement.key]
                  return <article className={`requirement-row ${mapped ? 'requirement-ready' : ''}`} key={requirement.key}>
                    <div className="requirement-state">{mapped ? '✓' : '!'}</div>
                    <div className="requirement-copy"><strong>{requirement.label}</strong><span>{requirement.occurrences.map(item => `${item.year}. yıl ${termLabel(item.term)} · ${item.credits} AKTS`).join(' · ')}</span></div>
                    <label className="pool-select"><span>Mevcut havuz</span><select value={mapped || ''} onChange={event => setMappings(current => ({ ...current, [requirement.key]: event.target.value }))}><option value="">Havuz seçin</option>{pools.map(pool => <option key={pool.key} value={pool.key}>{pool.label} ({pool.courseCount})</option>)}</select></label>
                    <FilePicker compact label={mapped ? 'Dosyayı yenile' : 'Excel yükle'} hint="Seçmeli ders listesi" onFile={file => uploadElective(requirement, file)} busy={busy === `elective:${requirement.key}`} />
                  </article>
                })}
              </div>
            )}
            <div className="save-bar"><div><strong>Yayınlamaya hazır mı?</strong><span>Kaydedildiğinde ana sitedeki müfredat verisi hemen değişir.</span></div><button className="primary-button" onClick={saveCurriculum} disabled={busy === 'save' || missingCount > 0}>{busy === 'save' ? 'Kaydediliyor…' : 'Müfredatı kaydet'}</button></div>
          </section>
        )}

        <section className="content-card">
          <div className="section-heading"><div><span className="step-number neutral">3</span><div><h2>Aktif müfredatlar</h2><p>Ana sitede gösterilen müfredatları kontrol edin.</p></div></div></div>
          <div className="curriculum-list">
            {curricula.map(item => <button className="curriculum-row" key={item.id} onClick={() => openPreview(item.id)}>
              <span className="curriculum-avatar">{item.id.toUpperCase()}</span><span className="curriculum-info"><strong>{item.title_tr}</strong><small>{item.programCodes.join(' / ')} · {item.sourceFile || 'Eski veri'}</small></span><span className="curriculum-metric"><strong>{item.courseCount}</strong><small>ders</small></span><span className="curriculum-metric"><strong>{item.electiveRequirementCount}</strong><small>seçmeli türü</small></span><span className="row-action">{busy === `preview:${item.id}` ? '…' : 'Görüntüle →'}</span>
            </button>)}
          </div>
        </section>

        <CurriculumPreview curriculum={preview} onClose={() => setPreview(null)} />
      </main>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState('checking')
  useEffect(() => { request('/session').then(() => setAuth('yes')).catch(() => setAuth('no')) }, [])
  const logout = async () => { await request('/logout', { method: 'POST' }).catch(() => {}); setAuth('no') }
  if (auth === 'checking') return <div className="loading-screen"><span className="brand-mark">U</span><p>Panel hazırlanıyor…</p></div>
  if (auth === 'no') return <Login onLogin={() => setAuth('yes')} />
  return <Dashboard onLogout={logout} />
}
