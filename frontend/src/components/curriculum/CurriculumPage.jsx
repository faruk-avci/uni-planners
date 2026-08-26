import { useCallback, useEffect, useMemo, useState } from 'react'
import { courseService } from '../../services/courseService'
import { curriculumIdForProgramCode, groupCurriculumOptions } from '../../data/programs'
import './CurriculumPage.css'

const ELECTIVE_LABELS = {
  free: ['Serbest seçmeli', 'Free elective'],
  certificate: ['Sertifika seçmeli', 'Certificate elective'],
  social: ['Sosyal seçmeli', 'Social elective'],
  social_restricted: ['Kısıtlı sosyal seçmeli', 'Restricted social elective'],
  program: ['Program seçmeli', 'Program elective'],
  program_external: ['Program dışı seçmeli', 'External program elective'],
  specialization: ['Uzmanlık seçmeli', 'Specialization elective'],
  design_studio: ['Tasarım stüdyosu', 'Design studio'],
  finishing_project: ['Bitirme projesi', 'Finishing project'],
  faculty: ['Fakülte seçmeli', 'Faculty elective'],
  non_faculty: ['Fakülte dışı seçmeli', 'Non-faculty elective'],
  language: ['Dil seçmeli', 'Language elective'],
  restricted: ['Kısıtlı seçmeli', 'Restricted elective'],
  other: ['Diğer seçmeli', 'Other elective'],
}

function electiveTypeForSlot(course, availableTypes) {
  if (String(course.code || '').trim()) return null
  if (course.electiveType && availableTypes.includes(course.electiveType)) return course.electiveType
  const text = `${course.title_tr || ''} ${course.title_en || ''}`.toLocaleLowerCase('tr-TR')
  const available = new Set(availableTypes)

  const programArea = text.match(/\((fin|mgmt|mis|oper)\)/i)?.[1]?.toUpperCase()
  if (programArea && available.has(`program_${programArea}`)) return `program_${programArea}`
  if (text.includes('(mktg)') && available.has('specialization')) return 'specialization'

  const candidates = [
    [/program-dışı|program dışı|external program/, 'program_external'],
    [/fakülte-dışı|fakülte dışı|non-faculty/, 'non_faculty'],
    [/fakülte-içi|fakülte içi|faculty elective/, 'faculty'],
    [/ikinci yabancı dil|language elective/, 'language'],
    [/sosyal.*kısıtlı|restricted social/, 'social_restricted'],
    [/özelleşilen|specialization/, 'specialization'],
    [/tasarım stüdyosu|design studio/, 'design_studio'],
    [/bitirme projesi|finishing project/, 'finishing_project'],
    [/sertifika|certificate/, 'certificate'],
    [/sosyal|social science/, 'social'],
    [/kısıtlı|restricted/, 'restricted'],
    [/serbest|free elective/, 'free'],
    [/program-içi|program içi|program elective/, 'program'],
  ]
  return candidates.find(([pattern, type]) => pattern.test(text) && available.has(type))?.[1] || null
}

const normalizeCode = code => String(code || '').replace(/\s+/g, '').toUpperCase()

function CurriculumPage({ language, onAddCourse, major, auditResult }) {
  const [programs, setPrograms] = useState([])
  const [selected, setSelected] = useState(() => curriculumIdForProgramCode(major))
  const [curriculum, setCurriculum] = useState(null)
  const [tab, setTab] = useState('mandatory')
  const [selectedElectiveType, setSelectedElectiveType] = useState(null)
  const [modalElectiveType, setModalElectiveType] = useState(null)
  const [electiveCredit, setElectiveCredit] = useState('all')
  const [offeredFirst, setOfferedFirst] = useState(true)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  const programGroups = groupCurriculumOptions(programs, language)

  const auditActive = Boolean(auditResult && !auditResult.error && auditResult.curriculumId === selected)
  const auditMissingSet = useMemo(
    () => new Set(auditActive ? auditResult.requiredMissing.map(c => normalizeCode(c.code)) : []),
    [auditActive, auditResult]
  )
  // Required-course matches plus any elective course the audit actually allocated
  // to a pool (electiveTypes[].courses) — a course can satisfy an elective slot
  // without ever appearing in requiredTaken, so both sources are needed here.
  const auditCompletedSet = useMemo(() => {
    if (!auditActive) return new Set()
    const codes = auditResult.requiredTaken.map(c => normalizeCode(c.code))
    for (const type of auditResult.electiveTypes || []) {
      for (const course of type.courses || []) codes.push(normalizeCode(course.code))
    }
    return new Set(codes)
  }, [auditActive, auditResult])

  // The semester-plan grid shows generic "SEÇMELİ" placeholder slots — usually
  // more of them per type than a student actually needs, since the template
  // just lists every semester the elective could be taken in. We don't know
  // which specific slot instance a taken course was meant to fill (term/year
  // was intentionally not tracked from the audit PDF), so instead: walk the
  // slots of a type in document order and fill as many of them as the type's
  // allocated courses cover, splitting a course across a slot boundary when
  // credits don't line up exactly. Remaining, uncovered slots stay as plain
  // open placeholders.
  const auditSlotAssignments = useMemo(() => {
    const assignments = new Map()
    if (!auditActive || !curriculum) return assignments
    const availableTypes = Object.keys(curriculum.electives || {})
    const slotsByType = new Map()
    for (const [year, terms] of Object.entries(curriculum.semesters || {})) {
      for (const term of ['fall', 'spring']) {
        (terms[term] || []).forEach((course, index) => {
          const type = electiveTypeForSlot(course, availableTypes)
          if (!type) return
          if (!slotsByType.has(type)) slotsByType.set(type, [])
          slotsByType.get(type).push({ slotId: `${year}-${term}-${index}`, credits: Number(course.credits) || 0 })
        })
      }
    }
    for (const type of auditResult.electiveTypes || []) {
      const slots = slotsByType.get(type.key) || []
      const queue = (type.courses || []).map(c => ({ code: c.code, remaining: c.creditsUsed }))
      let qi = 0
      for (const slot of slots) {
        if (qi >= queue.length) break
        let need = slot.credits
        const used = []
        while (need > 0.01 && qi < queue.length) {
          const chunk = queue[qi]
          const take = Math.min(chunk.remaining, need)
          if (take > 0.01) used.push({ code: chunk.code, creditsUsed: take })
          chunk.remaining -= take
          need -= take
          if (chunk.remaining <= 0.01) qi += 1
        }
        if (used.length) assignments.set(slot.slotId, used)
      }
    }
    return assignments
  }, [auditActive, auditResult, curriculum])

  useEffect(() => {
    courseService.getCurriculums()
      .then(data => {
        setPrograms(data)
        if (selected && !data.some(item => item.id === selected)) setSelected('')
        if (!selected) setLoading(false)
      })
      .catch(() => setError(tr('Müfredat listesi yüklenemedi.', 'Could not load curriculum list.')))
  }, [])

  useEffect(() => {
    setSelected(curriculumIdForProgramCode(major))
  }, [major])

  useEffect(() => {
    if (!selected) {
      setCurriculum(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    setSelectedElectiveType(null)
    setElectiveCredit('all')
    setOfferedFirst(true)
    localStorage.setItem('uniplanner_curriculum', selected)
    courseService.getCurriculum(selected)
      .then(setCurriculum)
      .catch(() => setError(tr('Müfredat yüklenemedi.', 'Could not load the curriculum.')))
      .finally(() => setLoading(false))
  }, [selected])

  const handleProgramChange = id => {
    setSelected(id)
  }

  useEffect(() => {
    if (!modalElectiveType) return
    const closeOnEscape = event => {
      if (event.key === 'Escape') setModalElectiveType(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [modalElectiveType])

  const matches = course => {
    const needle = query.trim().toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-US')
    if (!needle) return true
    return `${course.code} ${course.title_tr || ''} ${course.title_en || ''}`.toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-US').includes(needle)
  }

  const electiveLabel = key => {
    if (curriculum?.electiveLabels?.[key]) return curriculum.electiveLabels[key]
    if (ELECTIVE_LABELS[key]) return ELECTIVE_LABELS[key][language === 'tr' ? 0 : 1]
    if (key.startsWith('program_')) return `${tr('Program seçmeli', 'Program elective')} (${key.slice(8)})`
    return key.replaceAll('_', ' ')
  }

  const openElectivePool = type => {
    setElectiveCredit('all')
    setModalElectiveType(type)
  }

  const selectElectiveType = type => {
    setSelectedElectiveType(type)
    setElectiveCredit('all')
  }

  const electiveCreditOptions = useMemo(() => {
    if (!curriculum) return []
    return [...new Set(Object.values(curriculum.electives || {})
      .flat()
      .map(course => Number(course.credits))
      .filter(Number.isFinite))]
      .sort((a, b) => a - b)
  }, [curriculum])

  const matchesElectiveCredit = useCallback(course => (
    electiveCredit === 'all' || Number(course.credits) === Number(electiveCredit)
  ), [electiveCredit])
  const sortElectiveCourses = useCallback((a, b) => {
    if (offeredFirst) {
      const offeredDifference = Number(b.offered) - Number(a.offered)
      if (offeredDifference) return offeredDifference
    }
    return String(a.code).localeCompare(String(b.code))
  }, [offeredFirst])

  const addCurriculumCourse = (course, source) => {
    if (!course.offered || !course.code) return
    onAddCourse({
      code: course.code,
      name: language === 'tr' ? course.title_tr : (course.title_en || course.title_tr),
      credits: Number(course.credits) || 0,
      prereq: course.prereq || '',
      coreq: course.coreq || '',
      assessments: [],
    }, undefined, source)
  }

  const modalCourses = useMemo(() => {
    if (!curriculum || !modalElectiveType) return []
    return [...(curriculum.electives[modalElectiveType] || [])]
      .filter(matchesElectiveCredit)
      .sort(sortElectiveCourses)
  }, [curriculum, modalElectiveType, matchesElectiveCredit, sortElectiveCourses])

  const CourseRow = ({ course, source = 'curriculum', slotId }) => {
    const electiveType = electiveTypeForSlot(course, Object.keys(curriculum.electives || {}))
    if (electiveType) {
      const filledBy = slotId ? auditSlotAssignments.get(slotId) : null
      if (filledBy) {
        return (
          <li className="curriculum-course curriculum-elective-slot curriculum-elective-slot-filled">
            <div className="elective-slot-button">
              <span className="elective-slot-marker elective-slot-marker-filled" />
              <span className="curriculum-code elective-slot-code">{tr('SEÇMELİ', 'ELECTIVE')}</span>
              <span className="elective-slot-copy">
                <strong>{language === 'tr' ? course.title_tr : (course.title_en || course.title_tr)}</strong>
                <span className="elective-slot-filled-courses">
                  {filledBy.map(c => `${c.code} · ${c.creditsUsed} ECTS`).join(', ')}
                </span>
              </span>
              <span className="elective-slot-action">
                <span className="curriculum-audit-badge curriculum-audit-badge-taken">{tr('Tamamlandı', 'Completed')}</span>
              </span>
            </div>
          </li>
        )
      }
      return (
        <li className="curriculum-course curriculum-elective-slot">
          <div className="elective-slot-button">
            <span className="elective-slot-marker" />
            <span className="curriculum-code elective-slot-code">{tr('SEÇMELİ', 'ELECTIVE')}</span>
            <span className="elective-slot-copy">
              <strong>{language === 'tr' ? course.title_tr : (course.title_en || course.title_tr)}</strong>
              <span>{tr('Uygun dersleri gör', 'View matching courses')}</span>
            </span>
            <span className="elective-slot-action">
              <span className="elective-slot-credit">{course.credits} ECTS</span>
              <button type="button" className="elective-slot-show" onClick={() => openElectivePool(electiveType)}>
                {tr('Göster', 'Show')}
              </button>
            </span>
          </div>
        </li>
      )
    }

    const taken = auditActive && auditCompletedSet.has(normalizeCode(course.code))
    const missing = auditActive && auditMissingSet.has(normalizeCode(course.code))

    return (
      <li className={[
        'curriculum-course',
        course.offered ? 'curriculum-course-offered' : 'curriculum-course-not-offered',
        taken ? 'curriculum-course-taken' : '',
        missing ? 'curriculum-course-missing' : '',
      ].filter(Boolean).join(' ')}>
        <div className="curriculum-course-main">
          <span className={`course-status-dot ${course.offered ? 'course-status-open' : 'course-status-closed'}`} role="img" aria-label={course.offered ? tr('Bu dönem açıldı', 'Offered this term') : tr('Bu dönem açılmadı', 'Not offered this term')} />
          <span className="curriculum-code">{course.code || '—'}</span>
          <span className="curriculum-title">{language === 'tr' ? course.title_tr : (course.title_en || course.title_tr)}</span>
          {taken && <span className="curriculum-audit-badge curriculum-audit-badge-taken">{tr('Tamamlandı', 'Completed')}</span>}
        </div>
        <div className="curriculum-course-meta">
          <span>{course.credits} ECTS</span>
          {taken ? null : (
            <button
              type="button"
              className="curriculum-add-btn"
              disabled={!course.offered}
              onClick={() => addCurriculumCourse(course, source)}
              aria-label={`${course.code} ${tr('dersini sepete ekle', 'add course to basket')}`}
            >
              {tr('Ekle', 'Add')}
            </button>
          )}
        </div>
        {(course.prereq || course.coreq) && (
          <div className="curriculum-requisites">
            {course.prereq && <span><strong>{tr('Ön koşul', 'Prerequisite')}:</strong> {course.prereq}</span>}
            {course.coreq && <span><strong>{tr('Yan koşul', 'Corequisite')}:</strong> {course.coreq}</span>}
          </div>
        )}
      </li>
    )
  }

  const visibleElectiveGroups = curriculum
    ? Object.entries(curriculum.electives)
      .filter(([type]) => !selectedElectiveType || type === selectedElectiveType)
      .map(([type, list]) => ({
        type,
        courses: [...list].filter(matches).filter(matchesElectiveCredit).sort(sortElectiveCourses),
      }))
      .filter(group => group.courses.length > 0)
    : []

  const renderElectiveControls = () => (
    <div className="elective-control-set">
      <div className="elective-credit-filter" role="group" aria-label={tr('AKTS filtresi', 'ECTS filter')}>
        <span className="elective-control-label">{tr('AKTS', 'ECTS')}</span>
        <div className="elective-credit-chips">
          <button
            type="button"
            className={electiveCredit === 'all' ? 'active' : ''}
            onClick={() => setElectiveCredit('all')}
          >
            {tr('Tümü', 'All')}
          </button>
          {electiveCreditOptions.map(credit => (
            <button
              type="button"
              key={credit}
              className={Number(electiveCredit) === credit ? 'active' : ''}
              onClick={() => setElectiveCredit(String(credit))}
            >
              {credit}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`offered-first-toggle ${offeredFirst ? 'active' : ''}`}
        aria-pressed={offeredFirst}
        onClick={() => setOfferedFirst(value => !value)}
      >
        <span className="offered-first-switch" aria-hidden="true"><span /></span>
        {tr('Açık dersler önce', 'Offered courses first')}
      </button>
    </div>
  )

  return (
    <main className="curriculum-page">
      <section className="curriculum-heading">
        <div className="curriculum-heading-copy">
          <h1>{tr('Müfredat', 'Curriculum')}</h1>
          {curriculum ? (
            <p>
              <strong>{language === 'tr' ? curriculum.title_tr : curriculum.title_en}</strong>
              <span>{curriculum.programCodes.join(' · ')} · {curriculum.catalogTerm}</span>
            </p>
          ) : (
            <p>{tr('Lisans ders planları', 'Undergraduate degree plans')}</p>
          )}
        </div>
        <label className="curriculum-select-label">
          <span>{tr('Program', 'Program')}</span>
          <select value={selected} onChange={event => handleProgramChange(event.target.value)}>
            <option value="">{tr('-- Program Seçin --', '-- Select Program --')}</option>
            {programGroups.map(group => (
              <optgroup key={group.id} label={group.label}>
                {group.programs.map(program => <option key={program.id} value={program.id}>{program.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </section>

      {error && <div className="curriculum-state curriculum-error">{error}</div>}
      {loading && <div className="curriculum-state">{tr('Müfredat yükleniyor…', 'Loading curriculum…')}</div>}
      {!loading && !curriculum && !error && (
        <div className="curriculum-state">
          {tr('Müfredatı görmek için yukarıdan bir program seçin.', 'Select a program above to view its curriculum.')}
        </div>
      )}

      {!loading && curriculum && (
        <>
          {auditActive && (
            <section className="curriculum-audit-summary">
              <header>
                <span className="curriculum-audit-eyebrow">{tr('Mezuniyet denetimi', 'Degree audit')}</span>
                <h3>{tr('Seçmeli ilerlemesi', 'Elective progress')}</h3>
              </header>
              <div className="curriculum-audit-types">
                {auditResult.electiveTypes.map(type => (
                  <div key={type.key} className={`curriculum-audit-type curriculum-audit-type-${type.status}`}>
                    <div className="curriculum-audit-type-head">
                      <strong>{type.label}</strong>
                      <span>{type.filled} / {type.required} ECTS{type.estimated ? ` (${tr('tahmini', 'estimated')})` : ''}</span>
                    </div>
                    {type.courses.length > 0 && (
                      <div className="curriculum-audit-type-courses">
                        {type.courses.map(c => (
                          <span key={c.code} className="curriculum-audit-chip">{c.code} · {c.creditsUsed} ECTS</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {auditResult.unplaced.length > 0 && (
                <div className="curriculum-audit-unplaced">
                  <strong>{tr('Yerleştirilemeyen dersler', "Courses that couldn't be placed")}</strong>
                  <div className="curriculum-audit-type-courses">
                    {auditResult.unplaced.map(c => (
                      <span key={c.code} className="curriculum-audit-chip curriculum-audit-chip-unplaced">{c.code} · {c.credits} ECTS</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="curriculum-content" id="curriculum-results">
            <div className="curriculum-toolbar">
              <div className="curriculum-tabs" role="tablist">
                <button className={tab === 'mandatory' ? 'active' : ''} onClick={() => setTab('mandatory')}>{tr('Dönem Planı', 'Semester Plan')}</button>
                <button className={tab === 'electives' ? 'active' : ''} onClick={() => { setTab('electives'); setSelectedElectiveType(null); setElectiveCredit('all') }}>{tr('Seçmeli Dersler', 'Electives')}</button>
              </div>
              <div className="curriculum-filters">
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr('Ders kodu veya adı ara', 'Search code or title')} />
              </div>
            </div>

            {tab === 'electives' && (
              <>
                <div className="elective-type-filter">
                  <button className={!selectedElectiveType ? 'active' : ''} onClick={() => selectElectiveType(null)}>{tr('Tüm seçmeli türleri', 'All elective types')}</button>
                  {Object.keys(curriculum.electives).map(type => (
                    <button key={type} className={selectedElectiveType === type ? 'active' : ''} onClick={() => selectElectiveType(type)}>{electiveLabel(type)}</button>
                  ))}
                </div>
                <div className="elective-list-controls">
                  {renderElectiveControls()}
                </div>
              </>
            )}

            {tab === 'mandatory' ? (
              <div className="curriculum-years">
                {Object.entries(curriculum.semesters).map(([year, terms]) => (
                  <article className="curriculum-year" key={year}>
                    <h3>{year}. {tr('Yıl', 'Year')}</h3>
                    <div className="curriculum-semesters">
                      {['fall', 'spring'].map(term => {
                        const courses = terms[term].filter(matches)
                        return <section className="curriculum-semester" key={term}>
                          <header><h4>{term === 'fall' ? tr('Güz', 'Fall') : tr('Bahar', 'Spring')}</h4><span>{courses.reduce((sum, course) => sum + (Number(course.credits) || 0), 0)} ECTS</span></header>
                          {courses.length ? <ul>{courses.map((course, index) => <CourseRow key={`${term}-${course.code}-${index}`} course={course} slotId={`${year}-${term}-${terms[term].indexOf(course)}`} />)}</ul> : <p className="curriculum-empty">{tr('Eşleşen ders yok.', 'No matching courses.')}</p>}
                        </section>
                      })}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="curriculum-electives">
                {visibleElectiveGroups.length ? visibleElectiveGroups.map(({ type, courses }) => (
                  <article className="curriculum-elective-group" key={type}>
                    <header><h3>{electiveLabel(type)}</h3><span>{courses.length} {tr('ders', 'courses')}</span></header>
                    <ul>{courses.map((course, index) => <CourseRow key={`${type}-${course.code}-${index}`} course={course} source="curriculum_elective" />)}</ul>
                  </article>
                )) : (
                  <p className="curriculum-empty">{tr('Seçilen filtrelere uyan ders yok.', 'No courses match the selected filters.')}</p>
                )}
              </div>
            )}
          </section>

          {modalElectiveType && (
            <div className="elective-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModalElectiveType(null) }}>
              <section className="elective-modal" role="dialog" aria-modal="true" aria-labelledby="elective-modal-title">
                <header className="elective-modal-header">
                  <div>
                    <span className="elective-modal-eyebrow">{tr('Seçmeli ders havuzu', 'Elective course pool')}</span>
                    <h2 id="elective-modal-title">{electiveLabel(modalElectiveType)}</h2>
                    <p>{modalCourses.length} {tr('ders', 'courses')}</p>
                  </div>
                  <button type="button" className="elective-modal-close" onClick={() => setModalElectiveType(null)} aria-label={tr('Kapat', 'Close')}>×</button>
                </header>
                <div className="elective-modal-tools">
                  {renderElectiveControls()}
                </div>
                <div className="elective-modal-body">
                  {modalCourses.length ? (
                    <ul>{modalCourses.map((course, index) => <CourseRow key={`modal-${course.code}-${index}`} course={course} source="elective_popup" />)}</ul>
                  ) : (
                    <p className="curriculum-empty">{tr('Eşleşen ders yok.', 'No matching courses.')}</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  )
}

export default CurriculumPage
