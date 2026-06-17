import { useState, useEffect } from 'react'
import { courseService } from '../../services/courseService'
import './SearchSection.css'

function SearchSection({ language, onAddCourse }) {
  const [searchQuery, setSearchQuery] = useState('EE')
  const [selectedMajor, setSelectedMajor] = useState('')
  const [selectedProgramType, setSelectedProgramType] = useState('all')
  const [expandedCourse, setExpandedCourse] = useState(null)

  // Asynchronous API states
  const [majorsList, setMajorsList] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const t = {
    title: language === 'tr' ? 'Ders Ara' : 'Search Courses',
    placeholder: language === 'tr' ? 'Ders kodu veya adı yazın... (örn. EE 201, Sinyaller)' : 'Type course code or name... (e.g. EE 201, Signals)',
    search: language === 'tr' ? 'Ara' : 'Search',
    term: '2025-2026 Yaz',
    addAll: language === 'tr' ? 'Tümünü Ekle' : 'Add All',
    showSections: language === 'tr' ? 'Şubeleri Göster' : 'Show Sections',
    addSection: language === 'tr' ? 'Şube Ekle' : 'Add Section',
    hideSections: language === 'tr' ? 'Şubeleri Gizle' : 'Hide Sections',
    majorFilter: language === 'tr' ? 'Program / Bölüm Filtresi' : 'Filter by Major/Program',
    typeFilter: language === 'tr' ? 'Ders Türü' : 'Course Type',
    allTypes: language === 'tr' ? 'Tümü (Zorunlu + Seçmeli)' : 'All (Required + Elective)',
    requiredOnly: language === 'tr' ? 'Sadece Zorunlu' : 'Required Only',
    electiveOnly: language === 'tr' ? 'Sadece Seçmeli' : 'Elective Only',
    noResults: language === 'tr' ? 'Aramanıza uygun ders bulunamadı.' : 'No courses found matching your search.',
    selectMajor: language === 'tr' ? '-- Bölüm Seçin --' : '-- Select Major --',
    loading: language === 'tr' ? 'Veritabanı aranıyor...' : 'Querying database...',
  }

  // Fetch majors on mount
  useEffect(() => {
    courseService.getMajors().then(list => {
      setMajorsList(list || [])
    })
  }, [])

  // Search function — only called on button click or Enter
  const doSearch = () => {
    setIsLoading(true)
    courseService.searchCourses(searchQuery, {
      major: selectedMajor,
      programType: selectedProgramType
    }).then(results => {
      setSearchResults(results || [])
      setIsLoading(false)
    })
  }

  // Run initial search on mount
  useEffect(() => {
    doSearch()
  }, [])

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
    setSelectedMajor('');
    setSelectedProgramType('all');
    setSearchResults([]);
  }

  // Helper to serialize time slots for grouping comparison
  const getTimeKey = (times) => {
    if (!times || times.length === 0) return 'TBA';
    return times.map(t => `${t.day}|${t.start}-${t.end}`).sort().join(';');
  };

  // Helper to group sections by schedule time
  const groupSectionsByTime = (sections) => {
    const groups = {};
    for (const sec of sections) {
      const key = getTimeKey(sec.times);
      if (!groups[key]) {
        groups[key] = {
          key,
          times: sec.times,
          sections: []
        };
      }
      groups[key].sections.push(sec);
    }
    return Object.values(groups);
  };

  return (
    <section className="section search-section">
      <div className="section-header">
        <h2>{t.title}</h2>
        <span className="badge badge-purple">{t.term}</span>
      </div>

      {/* Search Bar + Filters */}
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
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="search-btn">{t.search}</button>
          <button type="button" className="clear-btn" onClick={handleClear}>{language === 'tr' ? 'Temizle' : 'Clear'}</button>
        </div>

        {/* Filter Dropdowns */}
        <div className="search-filters">
          <div className="filter-group">
            <label className="filter-label">{t.majorFilter}</label>
            <select 
              className="filter-select" 
              value={selectedMajor} 
              onChange={(e) => setSelectedMajor(e.target.value)}
            >
              <option value="">{t.selectMajor}</option>
              {majorsList.map(major => (
                <option key={major} value={major}>{major}</option>
              ))}
            </select>
          </div>

          {selectedMajor && (
            <div className="filter-group animate-fade-in">
              <label className="filter-label">{t.typeFilter}</label>
              <select 
                className="filter-select"
                value={selectedProgramType}
                onChange={(e) => setSelectedProgramType(e.target.value)}
              >
                <option value="all">{t.allTypes}</option>
                <option value="required">{t.requiredOnly}</option>
                <option value="elective">{t.electiveOnly}</option>
              </select>
            </div>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="search-results stagger-enter">
        {isLoading ? (
          <p className="no-results-msg">{t.loading}</p>
        ) : searchResults.length === 0 ? (
          <p className="no-results-msg">{t.noResults}</p>
        ) : (
          searchResults.map(course => {
            const isExpanded = expandedCourse === course.code
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
                      <span className="course-sections-badge">
                        {course.sections.length} {language === 'tr'
                          ? 'Şube'
                          : course.sections.length === 1 ? 'Section' : 'Sections'}
                      </span>
                      {selectedMajor && (
                        <span className={`badge ${course.required.includes(selectedMajor) ? 'badge-required' : 'badge-elective'}`}>
                          {course.required.includes(selectedMajor) 
                            ? (language === 'tr' ? 'Zorunlu' : 'Required')
                            : (language === 'tr' ? 'Seçmeli' : 'Elective')
                          }
                        </span>
                      )}
                    </div>
                    <h3 className="course-name">{course.name}</h3>
                    <p className="course-prereq">
                      <span className="prereq-label">{language === 'tr' ? 'Ön koşul:' : 'Prereq:'}</span> {course.prereq || '-'}
                    </p>
                  </div>
                  <div className="course-actions">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={(e) => { e.stopPropagation(); onAddCourse(course) }}
                    >
                      {t.addAll}
                    </button>
                    <button
                      className={`btn btn-sm btn-ghost sections-toggle ${isExpanded ? 'sections-toggle-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleSections(course.code) }}
                    >
                      {isExpanded ? t.hideSections : t.showSections}
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
                    {/* Sections Title */}
                    <div className="sections-header-bar">
                      <h4 className="expanded-section-title">
                        {language === 'tr' ? 'Şubeler ve Ders Programı' : 'Sections and Class Schedule'}
                      </h4>
                    </div>

                    <div className="sections-list">
                      {groupSectionsByTime(course.sections).map(group => {
                        const isGrouped = group.sections.length > 1;
                        const shortNames = group.sections.map(s => s.name.replace(course.code, '').trim());

                        return (
                          <div key={group.key} className="section-group-container">
                            {isGrouped ? (
                              <>
                                <div className="section-group-header">
                                  <div className="section-group-label-wrapper">
                                    <span className="section-group-label-text">
                                      {language === 'tr' ? 'Aynı saatli farklı şubeler:' : 'Same hours different sections:'}
                                    </span>
                                    <span className="section-group-badge">
                                      {shortNames.join('/')}
                                    </span>
                                  </div>
                                  <div className="section-times">
                                    {group.times.length === 0 ? (
                                      <span className="time-pill">{language === 'tr' ? 'Açıklanmadı' : 'TBA'}</span>
                                    ) : (
                                      group.times.map((time, i) => (
                                        <span key={i} className="time-pill">
                                          {dayAbbr[time.day] || time.day} {time.start}-{time.end}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                  <button
                                    className="btn btn-xs btn-ghost group-add-btn"
                                    onClick={() => onAddCourse(course, group.sections.map(s => s.name))}
                                    title={language === 'tr' ? 'Grup Olarak Ekle' : 'Add as Group'}
                                  >
                                    {language === 'tr' ? 'Grup Olarak Ekle' : 'Add as Group'}
                                  </button>
                                </div>
                                <div className="section-group-members">
                                  {group.sections.map(section => (
                                    <div key={section.name} className="section-row">
                                      <div className="section-info">
                                        <span className="section-name">{section.name}</span>
                                        <span className="section-lecturer">{section.lecturer}</span>
                                      </div>
                                      <button
                                        className="btn btn-sm btn-secondary section-add-btn"
                                        onClick={() => onAddCourse(course, [section.name])}
                                      >
                                        {t.addSection}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              // Render single section normally in a flat row
                              (() => {
                                const section = group.sections[0];
                                return (
                                  <div key={section.name} className="section-row normal-section-row">
                                    <div className="section-info">
                                      <span className="section-name">{section.name}</span>
                                      <span className="section-lecturer">{section.lecturer}</span>
                                    </div>
                                    <div className="section-times">
                                      {section.times.length === 0 ? (
                                        <span className="time-pill">{language === 'tr' ? 'Açıklanmadı' : 'TBA'}</span>
                                      ) : (
                                        section.times.map((time, i) => (
                                          <span key={i} className="time-pill">
                                            {dayAbbr[time.day] || time.day} {time.start}-{time.end}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                    <button
                                      className="btn btn-sm btn-secondary section-add-btn"
                                      onClick={() => onAddCourse(course, [section.name])}
                                    >
                                      {t.addSection}
                                    </button>
                                  </div>
                                );
                              })()
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
