import { useEffect, useRef, useState } from 'react'
import './Header.css'

const LAYOUTS = [
  { id: '1', tr: 'Klasik', en: 'Classic' },
  { id: '2', tr: 'Odak', en: 'Focus' },
  { id: '3', tr: 'Takvim', en: 'Calendar' },
]

const COLOR_THEMES = [
  { id: 'petrol', tr: 'Petrol', en: 'Petrol', color: '#1d5e66' },
  { id: 'iris', tr: 'İris', en: 'Iris', color: '#3b3f9a' },
  { id: 'neutral', tr: 'Obsidyen', en: 'Obsidian', color: '#23262b' },
  { id: 'ocean', tr: 'Ege', en: 'Aegean', color: '#1f5a96' },
  { id: 'forest', tr: 'Kazdağları', en: 'Mount Ida', color: '#2f5f3c' },
  { id: 'violet', tr: 'Mor Salkım', en: 'Wisteria', color: '#64459a' },
  { id: 'coral', tr: 'Günbatımı', en: 'Sunset', color: '#a8462a' },
]

function Header({
  language,
  toggleLanguage,
  colorTheme,
  setColorTheme,
  darkMode,
  onToggleDarkMode,
  activePage,
  onNavigate,
  onLogoClick,
  surveyUrl,
  onSurveyLinkClick,
  layout,
  onLayoutChange,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteRef = useRef(null)

  useEffect(() => {
    if (!paletteOpen) return undefined

    const closePalette = event => {
      if (event.key === 'Escape' || !paletteRef.current?.contains(event.target)) setPaletteOpen(false)
    }

    document.addEventListener('pointerdown', closePalette)
    document.addEventListener('keydown', closePalette)
    return () => {
      document.removeEventListener('pointerdown', closePalette)
      document.removeEventListener('keydown', closePalette)
    }
  }, [paletteOpen])

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          {/* Logo */}
          <button className="header-logo" type="button" onClick={onLogoClick} aria-label="UniPlanners" title="UniPlanners">
            <div className="logo-icon">

            </div>
            <span className="logo-text">UniPlanners</span>
          </button>

          {/* Nav */}
          <nav className="header-nav">
            <button type="button" onClick={() => onNavigate('planner')} className={`nav-link ${activePage === 'planner' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Planlayıcı' : 'Planner'}
            </button>
            <button type="button" onClick={() => onNavigate('curriculum')} className={`nav-link ${activePage === 'curriculum' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Müfredat' : 'Curriculum'}
            </button>
            <button type="button" onClick={() => onNavigate('recap')} className={`nav-link nav-link-secondary ${activePage === 'recap' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Özet' : 'Recap'}
            </button>
            {surveyUrl && (
              <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="nav-link nav-link-secondary" onClick={onSurveyLinkClick}>
                {language === 'tr' ? 'Anket' : 'Survey'}
              </a>
            )}
          </nav>
        </div>

        {/* Actions */}
        <div className="header-actions">
          <button
            className={`action-btn howto-mobile ${activePage === 'recap' ? 'action-btn-active' : ''}`}
            type="button"
            onClick={() => onNavigate('recap')}
            title={language === 'tr' ? 'Dönem Özeti' : 'Semester Recap'}
            aria-label={language === 'tr' ? 'Özet' : 'Recap'}
          >
            {language === 'tr' ? 'Özet' : 'Recap'}
          </button>
          {surveyUrl && (
            <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="action-btn howto-mobile" onClick={onSurveyLinkClick}>
              {language === 'tr' ? 'Anket' : 'Survey'}
            </a>
          )}
          {activePage === 'planner' && onLayoutChange && (
            <div className="layout-switch" role="radiogroup" aria-label={language === 'tr' ? 'Tasarım' : 'Design'}>
              <span className="layout-switch-label">{language === 'tr' ? 'Tasarım' : 'Design'}</span>
              {LAYOUTS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={layout === option.id}
                  className={`layout-switch-option ${layout === option.id ? 'layout-switch-active' : ''}`}
                  title={language === 'tr' ? option.tr : option.en}
                  onClick={() => onLayoutChange(option.id)}
                >
                  {option.id}
                </button>
              ))}
            </div>
          )}
          <button
            className="action-btn dark-mode-toggle"
            type="button"
            onClick={onToggleDarkMode}
            title={darkMode ? (language === 'tr' ? 'Aydınlık moda geç' : 'Switch to light mode') : (language === 'tr' ? 'Karanlık moda geç' : 'Switch to dark mode')}
            aria-label={darkMode ? (language === 'tr' ? 'Aydınlık moda geç' : 'Switch to light mode') : (language === 'tr' ? 'Karanlık moda geç' : 'Switch to dark mode')}
            aria-pressed={darkMode}
          >
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <div className="palette-picker" ref={paletteRef}>
              <button
                className={`action-btn palette-toggle ${paletteOpen ? 'action-btn-active' : ''}`}
                type="button"
                onClick={() => setPaletteOpen(open => !open)}
                title={language === 'tr' ? 'Renk teması' : 'Color theme'}
                aria-label={language === 'tr' ? 'Renk teması seç' : 'Choose color theme'}
                aria-haspopup="menu"
                aria-expanded={paletteOpen}
              >
                <span className="palette-current" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>

              {paletteOpen && (
                <div className="palette-menu" role="menu">
                  {activePage === 'planner' && onLayoutChange && (
                    <>
                      <span className="palette-menu-title">{language === 'tr' ? 'Tasarım' : 'Design'}</span>
                      {LAYOUTS.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          className={`palette-option ${layout === option.id ? 'palette-option-active' : ''}`}
                          onClick={() => {
                            onLayoutChange(option.id)
                            setPaletteOpen(false)
                          }}
                          role="menuitemradio"
                          aria-checked={layout === option.id}
                        >
                          <span className="layout-menu-num">{option.id}</span>
                          <span>{language === 'tr' ? option.tr : option.en}</span>
                          {layout === option.id && (
                            <svg className="palette-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                      <span className="palette-menu-divider" aria-hidden="true" />
                    </>
                  )}
                  <span className="palette-menu-title">
                    {language === 'tr' ? 'Renk teması' : 'Color theme'}
                  </span>
                  {COLOR_THEMES.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      className={`palette-option ${colorTheme === option.id ? 'palette-option-active' : ''}`}
                      onClick={() => {
                        setColorTheme(option.id)
                        setPaletteOpen(false)
                      }}
                      role="menuitemradio"
                      aria-checked={colorTheme === option.id}
                    >
                      <span className={`palette-swatch palette-swatch-${option.id}`} style={{ '--palette-swatch': option.color }} />
                      <span>{language === 'tr' ? option.tr : option.en}</span>
                      {colorTheme === option.id && (
                        <svg className="palette-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
          </div>

          <button
            className="action-btn"
            onClick={toggleLanguage}
            title={language === 'tr' ? 'Switch to English' : "Türkçe'ye geç"}
          >
            <span className="lang-toggle">
              {language === 'tr' ? 'EN' : 'TR'}
            </span>
          </button>

        </div>
      </div>
    </header>
  )
}

export default Header
