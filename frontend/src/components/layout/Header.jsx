import { useEffect, useRef, useState } from 'react'
import './Header.css'

const COLOR_THEMES = [
  { id: 'iris', tr: 'İris', en: 'Iris', color: '#6658e8' },
  { id: 'neutral', tr: 'Obsidyen', en: 'Obsidian', color: '#18181b' },
  { id: 'ozu', tr: 'Kampüs', en: 'Campus', color: '#a50050' },
  { id: 'ocean', tr: 'Ege', en: 'Aegean', color: '#2563eb' },
  { id: 'forest', tr: 'Kazdağları', en: 'Mount Ida', color: '#15803d' },
  { id: 'violet', tr: 'Mor Salkım', en: 'Wisteria', color: '#7c3aed' },
  { id: 'coral', tr: 'Günbatımı', en: 'Sunset', color: '#e05a47' },
]

function Header({
  language,
  toggleLanguage,
  colorTheme,
  setColorTheme,
  activePage,
  onNavigate,
  onLogoClick,
  surveyUrl,
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
            <button type="button" onClick={() => onNavigate('howto')} className={`nav-link nav-link-secondary ${activePage === 'howto' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Nasıl Kullanılır' : 'How to Use'}
            </button>
            {surveyUrl && (
              <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="nav-link nav-link-secondary">
                {language === 'tr' ? 'Anket' : 'Survey'}
              </a>
            )}
          </nav>
        </div>

        {/* Actions */}
        <div className="header-actions">
          <button
            className={`action-btn howto-mobile ${activePage === 'howto' ? 'action-btn-active' : ''}`}
            type="button"
            onClick={() => onNavigate('howto')}
            title={language === 'tr' ? 'Nasıl Kullanılır' : 'How to Use'}
            aria-label={language === 'tr' ? 'Nasıl Kullanılır' : 'How to Use'}
          >
            {language === 'tr' ? 'Nasıl?' : 'How to'}
          </button>
          {surveyUrl && (
            <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="action-btn howto-mobile">
              {language === 'tr' ? 'Anket' : 'Survey'}
            </a>
          )}
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
                      {colorTheme === option.id && <span className="palette-check" aria-hidden="true">✓</span>}
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
