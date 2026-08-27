import { useState } from 'react'
import { courseService } from '../../services/courseService'
import './SearchSection.css'

const normalizeCode = code => String(code || '').replace(/\s+/g, '').toUpperCase()

const MIN_QUERY_LENGTH = 2

function SearchSection({ language, onAddCourse, catalogTerm, basket = [], onRemoveCourse, onRemoveSection, onExcludeSection }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCourse, setExpandedCourse] = useState(null)

  // Asynchronous API states
  const [searchResults, setSearchResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [queryTooShort, setQueryTooShort] = useState(false)

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
  const doSearch = () => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setQueryTooShort(true)
      setSearchResults([])
      return
    }
    setQueryTooShort(false)
    setIsLoading(true)
    courseService.searchCourses(trimmed).then(results => {
      setSearchResults(results || [])
      setIsLoading(false)
    })
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

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    doSearch();
  }

  const handleClear = () => {
    setSearchQuery('');
    setSearchResults([]);
    setQueryTooShort(false);
  }

  const groupSectionsByTime = sections => {
    const groups = new Map()

    sections.forEach(section => {
      const key = section.times?.length
        ? section.times
          .map(time => `${time.day}|${time.start}-${time.end}`)
          .sort()
          .join(';')
        : `TBA-${section.name}`

      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(section)
    })

    return [...groups.values()]
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
          <div className="search-input-wrapper">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder={t.placeholder}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setQueryTooShort(false) }}
            />
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
                                  {group[0].times.map((time, index) => (
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
                              ) : section.times.map((time, index) => (
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
