import { useEffect, useRef, useState } from 'react'
import { courseService } from '../../services/courseService'
import { curriculumIdForProgramCode, equivalentProgramCodes } from '../../data/programs.js'
import subjectNamesData from '../../../../names.json'
import './SearchSection.css'

const normalizeCode = code => String(code || '').replace(/\s+/g, '').toUpperCase()

const MIN_QUERY_LENGTH = 2
const DAY_ORDER = new Map([
  ['Pazartesi', 0],
  ['Salı', 1],
  ['Çarşamba', 2],
  ['Perşembe', 3],
  ['Cuma', 4],
])

const compareMeetingTimes = (left, right) =>
  (DAY_ORDER.get(left.day) ?? 99) - (DAY_ORDER.get(right.day) ?? 99)
  || String(left.start || '').localeCompare(String(right.start || ''))
  || String(left.end || '').localeCompare(String(right.end || ''))

const sortedMeetingTimes = section => [...(section.times || [])].sort(compareMeetingTimes)

const WINDOWS_1252_BYTES = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
  ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
  ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
])

const decodeMojibakePass = value => {
  const bytes = []
  for (const character of String(value || '')) {
    const code = character.charCodeAt(0)
    if (code <= 0xff) bytes.push(code)
    else if (WINDOWS_1252_BYTES.has(character)) bytes.push(WINDOWS_1252_BYTES.get(character))
    else return String(value || '')
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes))
}

const repairSubjectText = value => {
  let repaired = String(value || '').trim()
  for (let pass = 0; pass < 2 && /[ÃÄÅÂƒ]/.test(repaired); pass += 1) repaired = decodeMojibakePass(repaired)
  return repaired
}

const SUBJECT_SUGGESTIONS = (subjectNamesData?.DATA?.rows || [])
  .filter(row => String(row.SUBJECTTYPE) === '1' && String(row.NAME || '').trim())
  .map(row => ({
    code: repairSubjectText(row.NAME),
    description: repairSubjectText(row.DESCRIPTION),
  }))
  .sort((left, right) => left.code.localeCompare(right.code, 'en'))

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

function SearchSection({ language, onAddCourse, catalogTerm, basket = [], onRemoveCourse, onRemoveSection, onExcludeSection, major = '' }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [expandedTimeGroups, setExpandedTimeGroups] = useState(() => new Set())
  const [electiveContext, setElectiveContext] = useState({ typesByCourse: {}, labels: {} })
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const searchWrapperRef = useRef(null)

  // Asynchronous API states
  const [searchResults, setSearchResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [queryTooShort, setQueryTooShort] = useState(false)

  useEffect(() => {
    const closeSuggestions = event => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowSuggestions(false)
        setActiveSuggestionIndex(-1)
      }
    }
    document.addEventListener('pointerdown', closeSuggestions)
    return () => document.removeEventListener('pointerdown', closeSuggestions)
  }, [])

  useEffect(() => {
    const curriculumId = curriculumIdForProgramCode(major)
    setElectiveContext({ typesByCourse: {}, labels: {} })
    if (!curriculumId) return undefined

    let cancelled = false
    courseService.getCurriculum(curriculumId).then(curriculum => {
      if (cancelled) return
      const typesByCourse = {}
      Object.entries(curriculum.electives || {}).forEach(([type, courses]) => {
        courses.forEach(course => {
          const code = normalizeCode(course.code)
          if (!code) return
          if (!typesByCourse[code]) typesByCourse[code] = []
          if (!typesByCourse[code].includes(type)) typesByCourse[code].push(type)
        })
      })
      setElectiveContext({ typesByCourse, labels: curriculum.electiveLabels || {} })
    }).catch(() => {
      if (!cancelled) setElectiveContext({ typesByCourse: {}, labels: {} })
    })

    return () => { cancelled = true }
  }, [major])

  const t = {
    title: language === 'tr' ? 'Ders Ara' : 'Search Courses',
    placeholder: language === 'tr' ? 'Ders kodu yazın... (örn. EE 201)' : 'Type a course code... (e.g. EE 201)',
    search: language === 'tr' ? 'Ara' : 'Search',
    term: catalogTerm || '2025-2026 Yaz',
    addAll: language === 'tr' ? 'Tümünü Ekle' : 'Add All',
    removeCourse: language === 'tr' ? 'Dersi Çıkar' : 'Remove Course',
    showSections: language === 'tr' ? 'Şubeleri Göster' : 'Show Sections',
    addSection: language === 'tr' ? 'Şube Ekle' : 'Add Section',
    hideSections: language === 'tr' ? 'Şubeleri Gizle' : 'Hide Sections',
    noResults: language === 'tr' ? 'Aramanıza uygun ders bulunamadı.' : 'No courses found matching your search.',
    tooShort: language === 'tr' ? 'Aramak için en az 2 karakter yazın.' : 'Type at least 2 characters to search.',
    loading: language === 'tr' ? 'Veritabanı aranıyor...' : 'Querying database...',
    sectionInBasketHint: language === 'tr'
      ? 'Bu dersin bir şubesi sepette. Tümünü eklemek, o şubeyi kaldırıp dersin tamamını ekler.'
      : 'A section of this course is in your basket. Adding all will replace it with the whole course.',
    remove: language === 'tr' ? 'Çıkar' : 'Remove',
  }

  // Search function — only called on button click or Enter
  const doSearch = (queryOverride) => {
    const trimmed = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setQueryTooShort(true)
      setSearchResults([])
      return
    }
    setQueryTooShort(false)
    setIsLoading(true)
    setShowSuggestions(false)
    setActiveSuggestionIndex(-1)
    courseService.searchCourses(trimmed).then(results => {
      setSearchResults(results || [])
      setIsLoading(false)
    })
  }

  const updateSuggestions = value => {
    const prefix = String(value || '').trim().toLocaleUpperCase('tr-TR')
    if (!prefix || /\s|\d/.test(prefix)) {
      setSuggestions([])
      setShowSuggestions(false)
      setActiveSuggestionIndex(-1)
      return
    }
    const matches = SUBJECT_SUGGESTIONS
      .filter(subject => subject.code.toLocaleUpperCase('tr-TR').startsWith(prefix))
      .slice(0, 10)
    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
    setActiveSuggestionIndex(-1)
  }

  const selectSuggestion = suggestion => {
    setSearchQuery(suggestion.code)
    setShowSuggestions(false)
    setActiveSuggestionIndex(-1)
    doSearch(suggestion.code)
  }

  const handleSearchKeyDown = event => {
    if (!showSuggestions || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestionIndex(previous => previous >= suggestions.length - 1 ? 0 : previous + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestionIndex(previous => previous <= 0 ? suggestions.length - 1 : previous - 1)
    } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault()
      selectSuggestion(suggestions[activeSuggestionIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setShowSuggestions(false)
      setActiveSuggestionIndex(-1)
    }
  }

  const dayAbbr = {
    'Pazartesi': 'Pzt',
    'Salı': 'Sal',
    'Çarşamba': 'Çar',
    'Perşembe': 'Per',
    'Cuma': 'Cum',
  }

  const toggleSections = (code) => {
    setExpandedCourse(prev => prev === code ? null : code)
  }

  const timeGroupKey = section => section.times?.length
    ? sortedMeetingTimes(section).map(time => `${time.day}|${time.start}-${time.end}`).join(';')
    : `TBA-${section.name}`

  const toggleTimeGroup = key => {
    setExpandedTimeGroups(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    doSearch();
  }

  const handleClear = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    setSearchResults([]);
    setQueryTooShort(false);
  }

  const groupSectionsByTime = sections => {
    const groups = new Map()

    sections.forEach(section => {
      const key = timeGroupKey(section)

      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(section)
    })

    return [...groups.values()].sort((left, right) => {
      const leftFirst = sortedMeetingTimes(left[0])[0]
      const rightFirst = sortedMeetingTimes(right[0])[0]
      if (!leftFirst && !rightFirst) return left[0].name.localeCompare(right[0].name)
      if (!leftFirst) return 1
      if (!rightFirst) return -1
      return compareMeetingTimes(leftFirst, rightFirst)
        || left[0].name.localeCompare(right[0].name)
    })
  }

  const planInfoFor = course => {
    const programCodes = equivalentProgramCodes(major)
    if (programCodes.some(program => course.required?.includes(program))) return { type: 'required', electiveTypes: [] }
    const curriculumTypes = electiveContext.typesByCourse[normalizeCode(course.code)] || []
    if (curriculumTypes.length > 0) return { type: 'elective', electiveTypes: curriculumTypes }
    if (programCodes.some(program => course.elective?.includes(program))) {
      return { type: 'elective', electiveTypes: [] }
    }
    return { type: '', electiveTypes: [] }
  }

  const electiveTypeLabel = type => {
    if (language === 'tr' && electiveContext.labels[type]) return electiveContext.labels[type]
    if (ELECTIVE_LABELS[type]) return ELECTIVE_LABELS[type][language === 'tr' ? 0 : 1]
    if (type.startsWith('program_')) return `${language === 'tr' ? 'Program seçmeli' : 'Program elective'} (${type.slice(8)})`

    const normalized = type.toLocaleLowerCase('tr-TR')
    const area = normalized.match(/(?:^|-)(fin|mgmt|mis|oper|mktg)(?:-|$)/i)?.[1]?.toUpperCase()
    if (normalized.includes('program-ici')) return `${language === 'tr' ? 'Program seçmeli' : 'Program elective'}${area ? ` (${area})` : ''}`
    if (normalized.includes('program-disi')) return language === 'tr' ? 'Program dışı seçmeli' : 'External program elective'
    if (normalized.includes('sosyal')) return language === 'tr' ? 'Sosyal bilimler seçmeli' : 'Social sciences elective'
    if (normalized.includes('sertifika')) return language === 'tr' ? 'Sertifika seçmeli' : 'Certificate elective'
    if (normalized.includes('serbest')) return language === 'tr' ? 'Serbest seçmeli' : 'Free elective'
    if (normalized.includes('fakulte-ici')) return language === 'tr' ? 'Fakülte seçmeli' : 'Faculty elective'
    if (normalized.includes('fakulte-disi')) return language === 'tr' ? 'Fakülte dışı seçmeli' : 'Non-faculty elective'
    if (normalized.includes('ozellesilen')) return language === 'tr' ? 'Uzmanlık seçmeli' : 'Specialization elective'
    return language === 'tr' ? 'Seçmeli' : 'Elective'
  }

  return (
    <section className="section search-section">
      <div className="section-header">
        <h2>{t.title}</h2>
        <span className="badge badge-purple">{t.term}</span>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="search-form">
        <div className="search-bar">
          <div className="search-input-wrapper" ref={searchWrapperRef}>
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder={t.placeholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setQueryTooShort(false)
                updateSuggestions(e.target.value)
              }}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => updateSuggestions(searchQuery)}
              autoComplete="off"
              spellCheck="false"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls="subject-suggestions"
              aria-activedescendant={activeSuggestionIndex >= 0 ? `subject-suggestion-${activeSuggestionIndex}` : undefined}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div id="subject-suggestions" className="search-suggestions-dropdown" role="listbox">
                <div className="suggestions-header">
                  {language === 'tr' ? 'Ders kodları' : 'Course codes'}
                </div>
                {suggestions.map((suggestion, index) => (
                  <button
                    id={`subject-suggestion-${index}`}
                    key={suggestion.code}
                    className={`suggestion-item ${index === activeSuggestionIndex ? 'suggestion-item-active' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    onPointerDown={event => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                  >
                    <strong>{suggestion.code}</strong>
                    {suggestion.description && <span>{suggestion.description}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="search-btn">{t.search}</button>
          <button type="button" className="clear-btn" onClick={handleClear}>{language === 'tr' ? 'Temizle' : 'Clear'}</button>
        </div>
      </form>

      {/* Results */}
      <div className="search-results stagger-enter">
        {isLoading ? (
          <p className="no-results-msg">{t.loading}</p>
        ) : queryTooShort ? (
          <p className="no-results-msg">{t.tooShort}</p>
        ) : searchResults.length === 0 ? (
          <p className="no-results-msg">{t.noResults}</p>
        ) : (
          searchResults.map(course => {
            const isExpanded = expandedCourse === course.code
            const planInfo = planInfoFor(course)
            const existing = basket.find(item => normalizeCode(item.code) === normalizeCode(course.code))
            const wholeCourseAdded = Boolean(existing && (!existing.sections || existing.sections.length === 0))
            const pinnedSections = new Set(wholeCourseAdded ? [] : existing?.sections || [])
            return (
              <div key={course.code} className="course-card">
                <div
                  className="course-header course-header-clickable"
                  onClick={() => toggleSections(course.code)}
                >
                  <div className="course-info">
                    <div className="course-code-row">
                      <span className="course-code">{course.code}</span>
                      <span className="course-credits">{course.credits} ECTS</span>
                      {planInfo.type === 'required' && (
                        <span className="badge badge-required">
                          {language === 'tr' ? 'Zorunlu' : 'Required'}
                        </span>
                      )}
                      {planInfo.type === 'elective' && (
                        planInfo.electiveTypes.length > 0
                          ? planInfo.electiveTypes.map(type => (
                            <span key={type} className="badge badge-elective" title={electiveTypeLabel(type)}>
                              {electiveTypeLabel(type)}
                            </span>
                          ))
                          : (
                            <span className="badge badge-elective">
                              {language === 'tr' ? 'Seçmeli' : 'Elective'}
                            </span>
                          )
                      )}
                    </div>
                    <h3 className="course-name">{course.name}</h3>
                    <p className="course-prereq">
                      <span className="prereq-label">{language === 'tr' ? 'Ön koşul:' : 'Prereq:'}</span> {course.prereq || '-'}
                    </p>
                    <p className="course-prereq">
                      <span className="prereq-label">{language === 'tr' ? 'Yan koşul:' : 'Coreq:'}</span> {course.coreq || '-'}
                    </p>
                  </div>
                  <div className="course-actions">
                    {wholeCourseAdded ? (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={(e) => { e.stopPropagation(); onRemoveCourse(course.code) }}
                      >
                        {t.removeCourse}
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={(e) => { e.stopPropagation(); onAddCourse(course) }}
                        title={pinnedSections.size > 0 ? t.sectionInBasketHint : undefined}
                      >
                        {t.addAll}
                      </button>
                    )}
                    <button
                      className={`btn btn-sm btn-ghost sections-toggle ${isExpanded ? 'sections-toggle-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleSections(course.code) }}
                    >
                      {isExpanded ? t.hideSections : t.showSections}
                      <span
                        className="sections-toggle-count"
                        title={`${course.sections.length} ${language === 'tr' ? 'şube' : 'sections'}`}
                      >
                        {course.sections.length}
                      </span>
                      <svg
                        className={`toggle-chevron ${isExpanded ? 'toggle-chevron-open' : ''}`}
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="course-expanded-content animate-slide-down">
                    <div className="sections-header-bar">
                      <h4 className="expanded-section-title">
                        {language === 'tr' ? 'Şubeler' : 'Sections'}
                      </h4>
                    </div>

                    <div className="sections-list">
                      {groupSectionsByTime(course.sections).map(group => {
                        if (course.sections.length > 8) {
                          const groupKey = `${course.code}|${timeGroupKey(group[0])}`
                          const groupOpen = expandedTimeGroups.has(groupKey)
                          const groupFullyAdded = group.every(section => pinnedSections.has(section.name))
                          return (
                            <div key={group.map(section => section.name).join('-')} className="same-time-group">
                              <div className="same-time-summary time-option-summary">
                                <button
                                  type="button"
                                  className="time-option-toggle"
                                  aria-expanded={groupOpen}
                                  onClick={() => toggleTimeGroup(groupKey)}
                                >
                                  <span className={`time-option-chevron ${groupOpen ? 'time-option-chevron-open' : ''}`} aria-hidden="true">›</span>
                                  <span className="time-option-copy">
                                    <span className="time-option-eyebrow">{language === 'tr' ? 'Saat seçeneği' : 'Time option'}</span>
                                    <span className="section-times">
                                      {sortedMeetingTimes(group[0]).map((time, index) => (
                                        <strong key={`${time.day}-${time.start}-${index}`}>
                                          {dayAbbr[time.day] || time.day} · {time.start}-{time.end}
                                        </strong>
                                      ))}
                                      {group[0].times.length === 0 && <strong>{language === 'tr' ? 'Açıklanmadı' : 'TBA'}</strong>}
                                    </span>
                                  </span>
                                  <span className="time-option-badges">
                                    <span>{group.length} {language === 'tr' ? 'şube' : 'sections'}</span>
                                  </span>
                                </button>
                                {wholeCourseAdded ? (
                                  <button
                                    className="btn btn-sm btn-danger-ghost same-time-add"
                                    onClick={() => onExcludeSection(course, group.map(section => section.name))}
                                  >
                                    {language === 'tr' ? 'Grubu Çıkar' : 'Remove Group'}
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-sm btn-secondary same-time-add"
                                    onClick={() => onAddCourse(course, group.map(section => section.name))}
                                    disabled={groupFullyAdded}
                                  >
                                    {language === 'tr' ? 'Bu Saati Kullan' : 'Use This Time'}
                                  </button>
                                )}
                              </div>
                              {groupOpen && (
                                <div className="same-time-options animate-slide-down">
                                  {group.map(section => {
                                    const sectionRemovable = wholeCourseAdded || pinnedSections.has(section.name)
                                    return (
                                      <div key={section.name} className="same-time-option">
                                        <div className="section-info">
                                          <span className="section-name">{section.name}</span>
                                          <span className="section-lecturer">{section.lecturer}</span>
                                        </div>
                                        {sectionRemovable ? (
                                          <button
                                            className="btn btn-sm btn-danger-ghost section-add-btn"
                                            onClick={() => wholeCourseAdded
                                              ? onExcludeSection(course, [section.name])
                                              : onRemoveSection(course.code, section.name)}
                                          >
                                            {t.remove}
                                          </button>
                                        ) : (
                                          <button
                                            className="btn btn-sm btn-ghost section-add-btn"
                                            onClick={() => onAddCourse(course, [section.name])}
                                          >
                                            {language === 'tr' ? 'Ekle' : 'Add'}
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        }

                        if (group.length > 1) {
                          const groupFullyAdded = group.every(section => pinnedSections.has(section.name))
                          return (
                            <div key={group.map(section => section.name).join('-')} className="same-time-group">
                              <div className="same-time-summary">
                                <div className="same-time-heading">
                                  <span>{language === 'tr' ? 'Aynı saatli şubeler' : 'Same-time sections'}</span>
                                  <strong>{group.map(section => section.name.replace(course.code, '').trim()).join(' / ')}</strong>
                                </div>
                                <div className="section-times">
                                  {sortedMeetingTimes(group[0]).map((time, index) => (
                                    <span key={`${time.day}-${time.start}-${index}`}>
                                      {dayAbbr[time.day] || time.day} · {time.start}-{time.end}
                                    </span>
                                  ))}
                                </div>
                                {wholeCourseAdded ? (
                                  <button
                                    className="btn btn-sm btn-danger-ghost same-time-add"
                                    onClick={() => onExcludeSection(course, group.map(section => section.name))}
                                  >
                                    {language === 'tr' ? 'Grubu Çıkar' : 'Remove Group'}
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-sm btn-secondary same-time-add"
                                    onClick={() => onAddCourse(course, group.map(section => section.name))}
                                    disabled={groupFullyAdded}
                                  >
                                    {language === 'tr' ? 'Grup Olarak Ekle' : 'Add as Group'}
                                  </button>
                                )}
                              </div>
                              <div className="same-time-options">
                                {group.map(section => {
                                  const sectionRemovable = wholeCourseAdded || pinnedSections.has(section.name)
                                  return (
                                    <div key={section.name} className="same-time-option">
                                      <div className="section-info">
                                        <span className="section-name">{section.name}</span>
                                        <span className="section-lecturer">{section.lecturer}</span>
                                      </div>
                                      {sectionRemovable ? (
                                        <button
                                          className="btn btn-sm btn-danger-ghost section-add-btn"
                                          onClick={() => wholeCourseAdded
                                            ? onExcludeSection(course, [section.name])
                                            : onRemoveSection(course.code, section.name)}
                                        >
                                          {t.remove}
                                        </button>
                                      ) : (
                                        <button
                                          className="btn btn-sm btn-ghost section-add-btn"
                                          onClick={() => onAddCourse(course, [section.name])}
                                        >
                                          {language === 'tr' ? 'Ekle' : 'Add'}
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }

                        const section = group[0]
                        const sectionRemovable = wholeCourseAdded || pinnedSections.has(section.name)
                        return (
                          <div key={section.name} className="section-row section-row-simple">
                            <div className="section-info">
                              <span className="section-name">{section.name}</span>
                              <span className="section-lecturer">{section.lecturer}</span>
                            </div>
                            <div className="section-times">
                              {section.times.length === 0 ? (
                                <span>{language === 'tr' ? 'Açıklanmadı' : 'TBA'}</span>
                              ) : sortedMeetingTimes(section).map((time, index) => (
                                <span key={`${time.day}-${time.start}-${index}`}>
                                  {dayAbbr[time.day] || time.day} · {time.start}-{time.end}
                                </span>
                              ))}
                            </div>
                            {sectionRemovable ? (
                              <button
                                className="btn btn-sm btn-danger-ghost section-add-btn"
                                onClick={() => wholeCourseAdded
                                  ? onExcludeSection(course, [section.name])
                                  : onRemoveSection(course.code, section.name)}
                              >
                                {t.remove}
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-ghost section-add-btn"
                                onClick={() => onAddCourse(course, [section.name])}
                              >
                                {language === 'tr' ? 'Ekle' : 'Add'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

export default SearchSection
