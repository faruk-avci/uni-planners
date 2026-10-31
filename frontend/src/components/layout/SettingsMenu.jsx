import { useEffect, useRef, useState } from 'react'
import './Header.css'

const COLOR_THEMES = [
  { id: 'petrol', tr: 'Petrol', en: 'Petrol', color: '#1d5e66' },
  { id: 'iris', tr: 'İris', en: 'Iris', color: '#3b3f9a' },
  { id: 'neutral', tr: 'Obsidyen', en: 'Obsidian', color: '#23262b' },
  { id: 'ocean', tr: 'Ege', en: 'Aegean', color: '#1f5a96' },
  { id: 'forest', tr: 'Kazdağları', en: 'Mount Ida', color: '#2f5f3c' },
  { id: 'violet', tr: 'Mor Salkım', en: 'Wisteria', color: '#64459a' },
  { id: 'coral', tr: 'Günbatımı', en: 'Sunset', color: '#a8462a' },
]

/* One settings menu for every page: theme, language and color palette. */
function SettingsMenu({ language, toggleLanguage, darkMode, onToggleDarkMode, colorTheme, setColorTheme }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
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
    <div className="palette-picker" ref={paletteRef}>
      <button
        className={`action-btn settings-toggle ${paletteOpen ? 'action-btn-active' : ''}`}
        type="button"
        onClick={() => setPaletteOpen(open => !open)}
        title={tr('Ayarlar', 'Settings')}
        aria-label={tr('Ayarlar', 'Settings')}
        aria-haspopup="menu"
        aria-expanded={paletteOpen}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {paletteOpen && (
        <div className="palette-menu settings-menu" role="menu" aria-label={tr('Ayarlar', 'Settings')}>
          <span className="palette-menu-title">{tr('Tema', 'Theme')}</span>
          <div className="settings-segment" role="radiogroup" aria-label={tr('Tema', 'Theme')}>
            {[[false, tr('Aydınlık', 'Light')], [true, tr('Karanlık', 'Dark')]].map(([dark, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={darkMode === dark}
                className={`settings-segment-option ${darkMode === dark ? 'settings-segment-active' : ''}`}
                onClick={() => { if (darkMode !== dark) onToggleDarkMode() }}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="palette-menu-title">{tr('Dil', 'Language')}</span>
          <div className="settings-segment" role="radiogroup" aria-label={tr('Dil', 'Language')}>
            {[['tr', 'Türkçe'], ['en', 'English']].map(([code, label]) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={language === code}
                className={`settings-segment-option ${language === code ? 'settings-segment-active' : ''}`}
                onClick={() => { if (language !== code) toggleLanguage() }}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="palette-menu-title">{tr('Renk', 'Color')}</span>
          {COLOR_THEMES.map(option => (
            <button
              key={option.id}
              type="button"
              className={`palette-option ${colorTheme === option.id ? 'palette-option-active' : ''}`}
              onClick={() => setColorTheme(option.id)}
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
  )
}

export default SettingsMenu
