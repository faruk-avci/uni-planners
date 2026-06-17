import { useState, useEffect } from 'react'
import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'
import './App.css'
import Header from './components/layout/Header'
import SearchSection from './components/search/SearchSection'
import BasketPanel from './components/basket/BasketPanel'
import SchedulePreview from './components/schedule/SchedulePreview'
import FreeDaySelector from './components/schedule/FreeDaySelector'
import CourseWorkload from './components/basket/CourseWorkload'
import { courseService } from './services/courseService'

function App() {
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('tr')
  // Basket model: each item is a course. `sections: []` = whole course (all
  // sections); a non-empty list pins specific sections. A course is either
  // whole OR section-specific, never both (ported from v1 rules).
  // Loaded from / persisted to the server per anonymous session.
  const [basket, setBasket] = useState([])
  const [basketLoaded, setBasketLoaded] = useState(false)
  const [notice, setNotice] = useState(null) // { type: 'error'|'success', text }
  const [freeDays, setFreeDays] = useState([])
  const [schedules, setSchedules] = useState([])
  const [currentSchedule, setCurrentSchedule] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [genMessage, setGenMessage] = useState(null)
  const [fittingCourses, setFittingCourses] = useState([])
  const [fittingShown, setFittingShown] = useState(false)
  const [fittingLoading, setFittingLoading] = useState(false)
  const [expandedFits, setExpandedFits] = useState(() => new Set())
  const [openFitGroups, setOpenFitGroups] = useState(() => new Set(['required']))
  const [fitTypeFilter, setFitTypeFilter] = useState(() => new Set()) // empty = show all
  const [majorsList, setMajorsList] = useState([])
  // '' = not chosen yet, 'none' = user declined to share, otherwise a program code
  const [major, setMajor] = useState(() => localStorage.getItem('uniplanner_major') || '')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Majors for the "courses that fit" major picker
  useEffect(() => {
    courseService.getMajors().then(list => setMajorsList(list || []))
  }, [])

  // Load the saved basket for this session (with assessment breakdowns).
  useEffect(() => {
    (async () => {
      const items = await courseService.getBasket()
      if (Array.isArray(items) && items.length > 0) {
        const data = await courseService.getAssessments(items.map(i => i.code))
        setBasket(items.map(i => ({ ...i, assessments: data[i.code] || [] })))
      }
      setBasketLoaded(true)
    })()
  }, [])

  // Persist the basket whenever it changes (debounced). Skips the initial load
  // so we never overwrite the saved basket with the empty starting state.
  useEffect(() => {
    if (!basketLoaded) return
    const t = setTimeout(() => {
      courseService.saveBasket(basket.map(i => ({ code: i.code, sections: i.sections || [], source: i.source || null })))
    }, 500)
    return () => clearTimeout(t)
  }, [basket, basketLoaded])

  // Sync assessments on mount / basket initialization
  useEffect(() => {
    const fetchAssessments = async () => {
      const codesToFetch = basket
        .filter(c => !c.assessments)
        .map(c => c.code);

      if (codesToFetch.length === 0) return;

      const data = await courseService.getAssessments(codesToFetch);
      setBasket(prev => prev.map(course => (
        data[course.code]
          ? { ...course, assessments: data[course.code] }
          : { ...course, assessments: [] }
      )));
    };

    fetchAssessments();
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'tr' ? 'en' : 'tr')
  }

  const notify = (type, text) => {
    setNotice({ type, text })
    window.clearTimeout(notify._t)
    notify._t = window.setTimeout(() => setNotice(null), 3500)
  }

  const tr = (a, b) => (language === 'tr' ? a : b)

  // Resolve and add a course's corequisite(s) (e.g. a lab/recitation) as whole
  // courses. Returns the codes actually added.
  const addCoreqs = async (course) => {
    const codes = (course.coreq || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    if (codes.length === 0) return []
    const norm = c => c.replace(/\s+/g, '').toUpperCase()
    const added = []
    for (const raw of codes) {
      const n = norm(raw)
      if (basket.some(i => norm(i.code) === n)) continue       // already in basket
      if (added.some(c => norm(c) === n)) continue             // just added
      const found = await courseService.getCourse(n)  // exact lookup, no search load
      if (!found || !found.code) continue
      setBasket(prev => prev.some(i => i.code === found.code)
        ? prev
        : [...prev, { code: found.code, name: found.name, credits: found.credits, sections: [], assessments: found.assessments || [], source: 'coreq' }])
      added.push(found.code)
    }
    return added
  }

  // Unified add handler. `sectionNames` empty/undefined = add whole course;
  // otherwise add those specific sections. Enforces v1 mutual-exclusivity and
  // automatically pulls in any corequisite (lab/recitation).
  const addCourseToBasket = async (course, sectionNames, source = 'search') => {
    const sections = Array.isArray(sectionNames) ? sectionNames : []
    const existing = basket.find(item => item.code === course.code)
    let mainMsg = null

    if (sections.length === 0) {
      // Whole-course add
      if (existing && existing.sections.length === 0) {
        notify('error', tr(`${course.code} zaten sepetinizde.`, `${course.code} is already in your basket.`))
        return
      }
      if (existing && existing.sections.length > 0) {
        notify('error', tr(
          `${course.code} dersinin bir şubesi sepette. Önce şubeyi kaldırın.`,
          `A section of ${course.code} is already in your basket. Remove it first.`))
        return
      }
      setBasket(prev => [...prev, {
        code: course.code, name: course.name, credits: course.credits,
        sections: [], assessments: course.assessments || [], source
      }])
      mainMsg = tr(`${course.code} eklendi`, `${course.code} added`)
    } else {
      // Section add(s)
      if (existing && existing.sections.length === 0) {
        notify('error', tr(
          `${course.code} dersinin tamamı sepette. Tek şube eklenemez.`,
          `The entire course ${course.code} is in your basket. Cannot add individual sections.`))
        return
      }
      const toAdd = sections.filter(s => !(existing?.sections || []).includes(s))
      if (toAdd.length === 0) {
        notify('error', tr(`Bu şube(ler) zaten sepette.`, `That section is already in your basket.`))
        return
      }
      setBasket(prev => {
        const found = prev.find(item => item.code === course.code)
        if (found) {
          return prev.map(item => item.code === course.code
            ? { ...item, sections: [...item.sections, ...toAdd] }
            : item)
        }
        return [...prev, {
          code: course.code, name: course.name, credits: course.credits,
          sections: [...toAdd], assessments: course.assessments || [], source
        }]
      })
      const shorts = toAdd.map(s => s.replace(course.code, '').trim()).join('/')
      mainMsg = tr(`${course.code} ${shorts} eklendi`, `${course.code} ${shorts} added`)
    }

    // Auto-add corequisite(s) and report both in one toast.
    const addedCoreqs = await addCoreqs(course)
    if (addedCoreqs.length > 0) {
      notify('success', tr(
        `${mainMsg} + yan koşul ${addedCoreqs.join(', ')} da eklendi.`,
        `${mainMsg} + corequisite ${addedCoreqs.join(', ')} added.`))
    } else {
      notify('success', `${mainMsg}.`)
    }
  }

  // Remove one pinned section; if it was the last, remove the course entirely.
  const removeSection = (code, sectionName) => {
    setBasket(prev => prev.flatMap(item => {
      if (item.code !== code) return [item]
      const remaining = item.sections.filter(s => s !== sectionName)
      return remaining.length === 0 ? [] : [{ ...item, sections: remaining }]
    }))
  }

  const handleGenerate = async () => {
    if (basket.length === 0) {
      setGenMessage(language === 'tr' ? 'Sepetiniz boş.' : 'Your basket is empty.')
      setSchedules([])
      return
    }
    setGenerating(true)
    setGenMessage(null)
    setFittingShown(false)
    setFittingCourses([])
    const result = await courseService.generateSchedule(basket, freeDays, 'balanced')
    setGenerating(false)
    setCurrentSchedule(0)

    if (result.success && result.schedules.length > 0) {
      setSchedules(result.schedules)
      setGenMessage(null)
    } else {
      setSchedules([])
      setGenMessage(result.message || (language === 'tr' ? 'Uygun program bulunamadı.' : 'No valid schedule found.'))
    }
  }

  const fetchFitting = async (forMajor) => {
    const schedule = schedules[currentSchedule]
    if (!schedule) return
    setFittingLoading(true)
    const occupied = schedule.lessons.flatMap(l => l.times)
    const exclude = basket.map(c => c.code)
    const result = await courseService.getFittingForSchedule(occupied, exclude, forMajor)
    setFittingCourses(result.courses || [])
    setFitTypeFilter(new Set()) // reset filters for the new result
    setFittingLoading(false)
  }

  const toggleFitTypeFilter = (key) => {
    setFitTypeFilter(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleShowFitting = () => {
    setFittingShown(true)
    // Only fetch when we have a real major; otherwise we ask for it first.
    if (major && major !== 'none') fetchFitting(major)
  }

  const handleSelectMajor = (value) => {
    setMajor(value)
    localStorage.setItem('uniplanner_major', value)
    if (value && value !== 'none') fetchFitting(value)
    else setFittingCourses([])
  }

  const toggleFitExpand = (code) => {
    setExpandedFits(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const toggleFitGroup = (key) => {
    setOpenFitGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const dayAbbr = { 'Pazartesi': 'Pzt', 'Salı': 'Sal', 'Çarşamba': 'Çar', 'Perşembe': 'Per', 'Cuma': 'Cum' }

  const electiveTypeLabel = (t) => {
    const map = {
      program: tr('Program seçmeli', 'Program elective'),
      program_external: tr('Program dışı seçmeli', 'External program elective'),
      specialization: tr('Uzmanlık seçmeli', 'Specialization elective'),
      design_studio: tr('Tasarım stüdyosu', 'Design studio'),
      finishing_project: tr('Bitirme projesi', 'Finishing project'),
      faculty: tr('Fakülte seçmeli', 'Faculty elective'),
      non_faculty: tr('Fakülte dışı seçmeli', 'Non-faculty elective'),
      certificate: tr('Sertifika seçmeli', 'Certificate elective'),
      social: tr('Sosyal seçmeli', 'Social elective'),
      social_restricted: tr('Sosyal seçmeli (kısıtlı)', 'Social elective (restricted)'),
      language: tr('Dil seçmeli', 'Language elective'),
      restricted: tr('Kısıtlı seçmeli', 'Restricted elective'),
      other: tr('Diğer seçmeli', 'Other elective'),
      free: tr('Serbest seçmeli', 'Free elective'),
    }
    if (map[t]) return map[t]
    // program_FIN / program_MGMT / ... -> "Program seçmeli (FIN)"
    if (t.startsWith('program_')) return `${tr('Program seçmeli', 'Program elective')} (${t.slice(8)})`
    return tr('Seçmeli', 'Elective')
  }

  // One fitting-course card (header + reqs + clipped section list).
  const renderFitCard = (course) => {
    const expanded = expandedFits.has(course.code)
    const shown = expanded ? course.sections : course.sections.slice(0, 4)
    const extra = course.sections.length - 4
    return (
      <div key={course.code} className="fit-course-card">
        <div className="fit-course-head">
          <div className="fit-course-info">
            <span className="fit-course-code">
              {course.code}
              {course.type === 'required' && (
                <span className="fit-type-tag fit-type-required">{tr('Zorunlu', 'Required')}</span>
              )}
              {course.type === 'elective' && (
                (course.electiveTypes && course.electiveTypes.length > 0)
                  ? course.electiveTypes.map(et => (
                    <span key={et} className={`fit-type-tag fit-et-${et}`}>{electiveTypeLabel(et)}</span>
                  ))
                  : <span className="fit-type-tag fit-type-elective">{tr('Seçmeli', 'Elective')}</span>
              )}
            </span>
            <span className="fit-course-name">{course.name}</span>
          </div>
          <button className="btn btn-sm btn-ghost fit-add-all" onClick={() => addCourseToBasket(course, undefined, 'fitting')}>
            {tr('Tümünü Ekle', 'Add All')}
          </button>
        </div>

        <div className="fit-course-reqs">
          {course.coreq && (
            <span className="fit-req fit-req-coreq">
              <strong>{tr('Yan koşul:', 'Coreq:')}</strong> {course.coreq}
            </span>
          )}
          <span className="fit-req">
            <strong>{tr('Ön koşul:', 'Prereq:')}</strong> {course.prereq || '-'}
          </span>
        </div>

        <div className="fit-section-list">
          {shown.map(s => (
            <div key={s.section} className="fit-section-row">
              <span className="fit-section-name">{s.section.replace(course.code, '').trim() || s.section}</span>
              <span className="fit-section-times">
                {s.times.map(t => `${dayAbbr[t.day] || t.day} ${t.start}-${t.end}`).join(', ')}
              </span>
              <button className="btn btn-sm btn-secondary fit-add-section" onClick={() => addCourseToBasket(course, [s.section], 'fitting')}>
                {tr('Şube Ekle', 'Add Section')}
              </button>
            </div>
          ))}
          {course.sections.length > 4 && (
            <button className="fit-show-more" onClick={() => toggleFitExpand(course.code)}>
              {expanded ? tr('Daha az göster', 'Show less') : tr(`+${extra} şube daha göster`, `Show ${extra} more sections`)}
            </button>
          )}
        </div>
      </div>
    )
  }

  const totalCredits = basket.reduce((sum, c) => sum + c.credits, 0)

  return (
    <div className="app">
      {notice && (
        <div className={`toast toast-${notice.type}`} role="status">{notice.text}</div>
      )}
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        language={language}
        toggleLanguage={toggleLanguage}
      />

      <main className="main">
        <div className="main-layout">
          {/* Left: Search + Results */}
          <div className="main-content">
            <SearchSection language={language} onAddCourse={addCourseToBasket} />

            {(schedules.length > 0 || genMessage) && (
              <section className="section">
                <div className="section-header">
                  <h2>{language === 'tr' ? 'Oluşturulan Programlar' : 'Generated Schedules'}</h2>
                  {schedules.length > 0 && (
                    <span className="badge badge-purple">
                      {language === 'tr' ? `${schedules.length} program bulundu` : `${schedules.length} schedules found`}
                    </span>
                  )}
                </div>
                {genMessage && (
                  <p className="schedule-message">{genMessage}</p>
                )}
                {schedules.length > 0 && (
                  <SchedulePreview
                    language={language}
                    schedules={schedules}
                    current={currentSchedule}
                    onPrev={() => { setCurrentSchedule(i => Math.max(0, i - 1)); setFittingShown(false) }}
                    onNext={() => { setCurrentSchedule(i => Math.min(schedules.length - 1, i + 1)); setFittingShown(false) }}
                  />
                )}

                {/* Courses that fit this schedule — NEW v2 feature */}
                {schedules.length > 0 && (
                  <div className="fits-block">
                    <button className="btn btn-secondary fits-toggle" onClick={handleShowFitting} disabled={fittingLoading}>
                      {fittingLoading
                        ? (language === 'tr' ? 'Yükleniyor…' : 'Loading…')
                        : (language === 'tr' ? 'Programıma Uyan Dersleri Göster' : 'Show Courses That Fit This Schedule')}
                      <span className="badge badge-new">{language === 'tr' ? 'Yeni' : 'New'}</span>
                    </button>

                    {fittingShown && (!major || major === 'none') && (
                      <div className="fits-major-prompt">
                        <p>
                          {major === 'none'
                            ? (language === 'tr'
                              ? 'Programınıza uyan dersleri gösterebilmek için bölümünüzü bilmemiz gerekiyor.'
                              : 'We need to know your major to show courses that fit your program.')
                            : (language === 'tr'
                              ? 'Bölümünüzü seçin; programınıza uyan zorunlu ve seçmeli dersleri gösterelim.'
                              : 'Select your major and we will show required and elective courses that fit your schedule.')}
                        </p>
                        <select
                          className="fits-major-select"
                          value={major}
                          onChange={(e) => handleSelectMajor(e.target.value)}
                        >
                          <option value="">{language === 'tr' ? '-- Bölüm Seçin --' : '-- Select Major --'}</option>
                          {majorsList.map(m => <option key={m} value={m}>{m}</option>)}
                          <option value="none">{language === 'tr' ? 'Paylaşmak istemiyorum' : "Don't want to share"}</option>
                        </select>
                      </div>
                    )}

                    {fittingShown && major && major !== 'none' && (
                      <>
                        <div className="fits-major-bar">
                          {language === 'tr' ? 'Bölüm:' : 'Major:'} <strong>{major}</strong>
                          <button className="fits-change-major" onClick={() => handleSelectMajor('')}>
                            {language === 'tr' ? 'Değiştir' : 'Change'}
                          </button>
                        </div>
                        {fittingLoading ? (
                          <p className="fits-empty">{language === 'tr' ? 'Yükleniyor…' : 'Loading…'}</p>
                        ) : fittingCourses.length === 0 ? (
                          <p className="fits-empty">
                            {language === 'tr' ? 'Bu programa uyan ders bulunamadı.' : 'No courses fit this schedule.'}
                          </p>
                        ) : (() => {
                          // Available filter options derived from the result.
                          const hasRequired = fittingCourses.some(c => c.type === 'required')
                          const typesPresent = []
                          for (const c of fittingCourses) {
                            for (const t of (c.electiveTypes || [])) {
                              if (!typesPresent.includes(t)) typesPresent.push(t)
                            }
                          }
                          // Apply the active filter.
                          const matchesFilter = (c) => {
                            if (fitTypeFilter.size === 0) return true
                            if (c.type === 'required') return fitTypeFilter.has('required')
                            return (c.electiveTypes || []).some(t => fitTypeFilter.has(t))
                          }
                          const shown = fittingCourses.filter(matchesFilter)

                          const required = shown.filter(c => c.type === 'required')
                          const electives = shown.filter(c => c.type === 'elective')
                          const elecGroups = []
                          for (const c of electives) {
                            const fac = c.faculty || tr('Diğer', 'Other')
                            let g = elecGroups.find(g => g.faculty === fac)
                            if (!g) { g = { faculty: fac, courses: [] }; elecGroups.push(g) }
                            g.courses.push(c)
                          }
                          const Group = ({ id, title, courses }) => {
                            const open = openFitGroups.has(id)
                            return (
                              <div className={`fit-group ${open ? 'fit-group-open' : ''}`}>
                                <button className="fit-group-header" onClick={() => toggleFitGroup(id)}>
                                  <span className="fit-group-title">{title} <span className="fit-group-count">{courses.length}</span></span>
                                  <svg className="fit-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                                </button>
                                {open && <div className="fits-courses-grid">{courses.map(renderFitCard)}</div>}
                              </div>
                            )
                          }
                          return (
                            <>
                              <div className="fits-warning">
                                {language === 'tr'
                                  ? 'Bu dersler programınıza saat olarak uyuyor. Bu dersi daha önce almış olabilir veya ön koşullarını sağlamıyor olabilirsiniz — lütfen kontrol edin.'
                                  : 'These courses fit your schedule time-wise. You may have already taken some, or may not meet the prerequisites — please verify.'}
                              </div>

                              {/* Elective-type filter chips */}
                              <div className="fit-filter-bar">
                                <span className="fit-filter-label">{tr('Filtre:', 'Filter:')}</span>
                                {hasRequired && (
                                  <button
                                    className={`fit-filter-chip ${fitTypeFilter.has('required') ? 'fit-filter-chip-active' : ''}`}
                                    onClick={() => toggleFitTypeFilter('required')}
                                  >{tr('Zorunlu', 'Required')}</button>
                                )}
                                {typesPresent.map(t => (
                                  <button key={t}
                                    className={`fit-filter-chip ${fitTypeFilter.has(t) ? 'fit-filter-chip-active' : ''}`}
                                    onClick={() => toggleFitTypeFilter(t)}
                                  >{electiveTypeLabel(t)}</button>
                                ))}
                                {fitTypeFilter.size > 0 && (
                                  <button className="fit-filter-clear" onClick={() => setFitTypeFilter(new Set())}>
                                    {tr('Temizle', 'Clear')}
                                  </button>
                                )}
                              </div>

                              {shown.length === 0 ? (
                                <p className="fits-empty">{tr('Seçilen filtreye uyan ders yok.', 'No courses match the selected filter.')}</p>
                              ) : (
                                <div className="fit-groups">
                                  {required.length > 0 && (
                                    <Group id="required" title={tr('Zorunlu Dersler', 'Required Courses')} courses={required} />
                                  )}
                                  {elecGroups.map(g => (
                                    <Group key={g.faculty} id={`fac:${g.faculty}`}
                                      title={`${g.faculty || tr('Diğer', 'Other')} — ${tr('Seçmeli', 'Elective')}`}
                                      courses={g.courses} />
                                  ))}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Course Workload (Ders Yükü) Table — NEW v2 feature */}
            {basket.length > 0 && (
              <section className="section section-new">
                <div className="section-header">
                  <h2>{language === 'tr' ? 'Ders Yükü & Ağırlıklar' : 'Course Workload & Weights'}</h2>
                  <span className="badge badge-new">{language === 'tr' ? 'Yeni' : 'New'}</span>
                </div>
                <CourseWorkload basket={basket} language={language} />
              </section>
            )}
          </div>

          {/* Right: Basket Sidebar */}
          <aside className="sidebar">
            <BasketPanel
              basket={basket}
              setBasket={setBasket}
              removeSection={removeSection}
              totalCredits={totalCredits}
              language={language}
            />

            <FreeDaySelector
              freeDays={freeDays}
              setFreeDays={setFreeDays}
              language={language}
            />

            <button className="btn btn-primary btn-generate" onClick={handleGenerate} disabled={generating}>
              {generating
                ? (language === 'tr' ? 'Oluşturuluyor…' : 'Generating…')
                : (language === 'tr' ? 'Program Oluştur' : 'Generate Schedules')}
            </button>
          </aside>
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-content">
          <p className="footer-credit">
            Designed and coded with <span>❤️</span> by{' '}
            <a href="https://github.com/faruk-avci" target="_blank" rel="noopener noreferrer" className="footer-link">
              @omer-faruk-avci
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
