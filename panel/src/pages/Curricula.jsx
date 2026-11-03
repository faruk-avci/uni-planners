import { useMemo, useRef, useState } from 'react'
import { request, formatDay } from '../api.js'
import { Notice, PageHeader, ReadOnlyNote, Section, useLoad } from '../ui.jsx'

const termLabel = term => (term === 'fall' ? 'Güz' : 'Bahar')
const countCourses = curriculum => Object.values(curriculum?.semesters || {}).reduce(
  (sum, terms) => sum + (terms.fall?.length || 0) + (terms.spring?.length || 0), 0
)

function FilePicker({ label, hint, onFile, busy, compact = false, disabled = false }) {
  const input = useRef(null)
  return (
    <button type="button" className={`file-picker ${compact ? 'file-picker-compact' : ''}`} onClick={() => input.current?.click()} disabled={busy || disabled}>
      <span className="file-picker-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4" /><polyline points="7 9 12 4 17 9" /><path d="M4 20h16" /></svg></span>
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
                        <span className="course-credit">{course.credits} Kredi</span>
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

// Excel-managed curricula (Özyeğin): upload the SIS degree plan, link each
// elective requirement to a pool, publish.
function PanelCurricula({ university, role, curricula, reload }) {
  const base = `/u/${university.slug}`
  const canEdit = role === 'editor'
  const programs = useLoad(() => request(`${base}/programs`), [base])
  const pools = useLoad(() => request(`${base}/elective-pools`), [base])
  const [programId, setProgramId] = useState('')
  const [draft, setDraft] = useState(null)
  const [sourceFile, setSourceFile] = useState('')
  const [mappings, setMappings] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [preview, setPreview] = useState(null)

  const programData = programs.data || { faculties: [], programs: [] }
  const poolList = pools.data || []
  const selectedProgram = programData.programs.find(program => program.id === programId)
  const groupedPrograms = useMemo(() => programData.faculties.map(faculty => ({
    ...faculty,
    programs: programData.programs.filter(program => program.faculty === faculty.id),
  })).filter(group => group.programs.length), [programData])

  const inspectCurriculum = async file => {
    setBusy('curriculum')
    setNotice(null)
    try {
      const parsed = await request(`${base}/curriculums/inspect-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        raw: await file.arrayBuffer(),
      })
      const automatic = {}
      for (const requirement of parsed.electiveRequirements) {
        const exact = poolList.find(pool => pool.key === requirement.key || pool.label.toLocaleLowerCase('tr-TR') === requirement.label.toLocaleLowerCase('tr-TR'))
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
      const parsed = await request(`${base}/elective-pools/inspect-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        raw: await file.arrayBuffer(),
      })
      // Scoped by programId: two majors whose spreadsheets use the same
      // elective label would otherwise overwrite each other's pool. Sharing a
      // pool on purpose still works through the "Mevcut havuz" dropdown.
      const saved = await request(`${base}/elective-pools/${encodeURIComponent(`${programId}-${requirement.key}`)}`, {
        method: 'PUT',
        body: { label: requirement.label, sourceFile: file.name, courses: parsed.courses },
      })
      pools.setData(current => [...(current || []).filter(pool => pool.key !== saved.key), saved].sort((a, b) => a.label.localeCompare(b.label, 'tr')))
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
      const saved = await request(`${base}/curriculums/${encodeURIComponent(programId)}`, {
        method: 'PUT',
        body: { draft, electivePoolRefs: mappings, sourceFile },
      })
      await reload()
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
    try { setPreview(await request(`${base}/curriculums/${encodeURIComponent(id)}`)) }
    catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy('') }
  }

  const missingCount = draft?.electiveRequirements.filter(item => !mappings[item.key]).length || 0

  return (
    <>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <section className="stats-grid">
        <div className="stat-card"><span>Yayındaki müfredat</span><strong>{curricula.length}</strong><small>Sitede görünen</small></div>
        <div className="stat-card"><span>Seçmeli havuzu</span><strong>{poolList.length}</strong><small>Birden fazla planda kullanılabilir</small></div>
        <div className="stat-card"><span>Toplam ders satırı</span><strong>{curricula.reduce((sum, item) => sum + item.courseCount, 0)}</strong><small>Yayındaki müfredatlarda</small></div>
      </section>

      {canEdit && (
        <Section icon="curricula" title="Müfredat yükle" description="Bölümü seçin ve SIS ders planı Excel dosyasını yükleyin." aside={<span className="format-chip">.XLS / .XLSX</span>}>
          <div className="import-grid">
            <label className="select-field"><span>Bölüm</span><select value={programId} onChange={event => { setProgramId(event.target.value); setDraft(null); setMappings({}) }}><option value="">Bölüm seçin</option>{groupedPrograms.map(group => <optgroup key={group.id} label={group.tr}>{group.programs.map(program => <option key={program.id} value={program.id}>{program.tr}</option>)}</optgroup>)}</select></label>
            <FilePicker label={sourceFile || 'Ders planı Excel dosyasını seç'} hint="CODE, TITLE, CREDITS ve SEMESTER sütunları okunur" onFile={inspectCurriculum} busy={busy === 'curriculum'} disabled={!programId} />
          </div>
          {!programId && <p className="inline-hint">Önce yüklemenin hangi bölüme ait olduğunu seçin.</p>}
        </Section>
      )}

      {draft && (
        <section className="content-card requirements-card">
          <div className="section-heading"><div><span className="step-number">2</span><div><h2>Seçmeli listelerini bağla</h2><p>Aynı tür daha önce yüklendiyse listeden seçin; değilse Excel dosyasını bir kez yükleyin.</p></div></div><span className={`mapping-status ${missingCount ? 'mapping-missing' : ''}`}>{missingCount ? `${missingCount} eksik` : 'Tümü hazır'}</span></div>
          <div className="import-summary"><strong>{selectedProgram?.tr}</strong><span>{draft.courseCount} zorunlu ders</span><span>{draft.electiveRequirements.length} benzersiz seçmeli türü</span><span>{sourceFile}</span></div>
          {draft.electiveRequirements.length === 0 ? <div className="empty-note">Bu dosyada boş CODE değerine sahip seçmeli satırı bulunmadı.</div> : (
            <div className="requirement-list">
              {draft.electiveRequirements.map(requirement => {
                const mapped = mappings[requirement.key]
                return <article className={`requirement-row ${mapped ? 'requirement-ready' : ''}`} key={requirement.key}>
                  <div className="requirement-state">{mapped
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    : '!'}</div>
                  <div className="requirement-copy"><strong>{requirement.label}</strong><span>{requirement.occurrences.map(item => `${item.year}. yıl ${termLabel(item.term)} · ${item.credits} Kredi`).join(' · ')}</span></div>
                  <label className="pool-select"><span>Mevcut havuz</span><select value={mapped || ''} onChange={event => setMappings(current => ({ ...current, [requirement.key]: event.target.value }))}><option value="">Havuz seçin</option>{poolList.map(pool => <option key={pool.key} value={pool.key}>{pool.label} ({pool.courseCount})</option>)}</select></label>
                  <FilePicker compact label={mapped ? 'Dosyayı yenile' : 'Excel yükle'} hint="Seçmeli ders listesi" onFile={file => uploadElective(requirement, file)} busy={busy === `elective:${requirement.key}`} />
                </article>
              })}
            </div>
          )}
          <div className="save-bar"><div><strong>Yayınlamaya hazır mı?</strong><span>Kaydedildiğinde ana sitedeki müfredat verisi hemen değişir.</span></div><button className="primary-button" onClick={saveCurriculum} disabled={busy === 'save' || missingCount > 0}>{busy === 'save' ? 'Kaydediliyor…' : 'Müfredatı kaydet'}</button></div>
        </section>
      )}

      <Section icon="curricula" title="Yayındaki müfredatlar" description="Ana sitede gösterilen müfredatlar. Görüntülemek için tıklayın.">
        <div className="curriculum-list">
          {curricula.map(item => <button className="curriculum-row" key={item.id} onClick={() => openPreview(item.id)}>
            <span className="curriculum-avatar">{item.id.toUpperCase()}</span><span className="curriculum-info"><strong>{item.title_tr}</strong><small>{item.programCodes.join(' / ')} · {item.sourceFile || 'Eski veri'}{item.updatedAt ? ` · ${formatDay(item.updatedAt)}` : ''}</small></span><span className="curriculum-metric"><strong>{item.courseCount}</strong><small>ders</small></span><span className="curriculum-metric"><strong>{item.electiveRequirementCount}</strong><small>seçmeli türü</small></span><span className="row-action">{busy === `preview:${item.id}` ? '…' : 'Görüntüle →'}</span>
          </button>)}
        </div>
      </Section>
      <CurriculumPreview curriculum={preview} onClose={() => setPreview(null)} />
    </>
  )
}

// Curricula shipped with the site (Bilkent): imported by script from pages
// saved out of STARS. Read-only tracking of what is listed and complete.
function StaticCurricula({ curricula }) {
  const [filter, setFilter] = useState('listed')
  const listed = curricula.filter(item => item.listed)
  const shown = filter === 'listed' ? listed : curricula
  const complete = listed.filter(item => item.electiveTypeCount === 0 || item.poolsSaved === item.electiveTypeCount).length
  return (
    <>
      <section className="stats-grid">
        <div className="stat-card"><span>Sitede listelenen</span><strong>{listed.length}</strong><small>STARS'tan aktarılan program</small></div>
        <div className="stat-card"><span>Seçmeli havuzu tam</span><strong>{complete} / {listed.length}</strong><small>Tüm havuzları kaydedilmiş</small></div>
        <div className="stat-card"><span>Katalogdaki program</span><strong>{curricula.length}</strong><small>Henüz listelenmeyenler dahil</small></div>
      </section>
      <Section
        icon="curricula"
        title="Program takibi"
        description="Bu üniversitenin müfredatları siteyle birlikte gelir; STARS sayfaları eklentiyle kaydedilip içe aktarma betiğiyle güncellenir."
        aside={<div className="segmented"><button className={filter === 'listed' ? 'active' : ''} onClick={() => setFilter('listed')}>Listelenen</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Tümü</button></div>}
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Program</th><th>STARS kodu</th><th>Durum</th><th className="num">Ders</th><th className="num">Seçmeli slotu</th><th>Havuzlar</th><th>Güncelleme</th></tr></thead>
            <tbody>
              {shown.map(item => {
                const poolsDone = item.electiveTypeCount > 0 && item.poolsSaved === item.electiveTypeCount
                return (
                  <tr key={item.id}>
                    <td><strong>{item.title_tr}</strong>{item.title_en !== item.title_tr && <small>{item.title_en}</small>}</td>
                    <td>{item.programCode ? (item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.programCode}</a> : item.programCode) : '—'}</td>
                    <td><span className={`pill ${item.listed ? 'pill-ok' : 'pill-muted'}`}>{item.listed ? 'Sitede' : 'Listelenmiyor'}</span></td>
                    <td className="num">{item.courseCount}</td>
                    <td className="num">{item.electiveSlotCount}</td>
                    <td>{item.electiveTypeCount ? <span className={`pill ${poolsDone ? 'pill-ok' : 'pill-warn'}`}>{item.poolsSaved} / {item.electiveTypeCount}</span> : '—'}</td>
                    <td>{formatDay(item.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  )
}

export default function Curricula({ university, role }) {
  const { data, error, reload } = useLoad(() => request(`/u/${university.slug}/curriculums`), [university.slug])
  return (
    <>
      <PageHeader title="Müfredatlar" subtitle={`${university.name} ders planları ve seçmeli havuzları.`} />
      {data?.source === 'panel' && <ReadOnlyNote role={role} />}
      {error && <div className="alert alert-error">{error}</div>}
      {data?.source === 'panel' && <PanelCurricula university={university} role={role} curricula={data.curricula} reload={reload} />}
      {data?.source === 'static' && <StaticCurricula curricula={data.curricula} />}
    </>
  )
}
