import { useEffect } from 'react'
import './MajorPrompt.css'

function MajorPrompt({ language, groups, selectedMajor, onSelect, onClose }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape' && onClose) onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div className="major-prompt-backdrop" onMouseDown={event => {
      if (onClose && event.target === event.currentTarget) onClose()
    }}>
      <section className="major-prompt" role="dialog" aria-modal="true" aria-labelledby="major-prompt-title">
        <header className="major-prompt-header">
          <div>
            <span className="major-prompt-eyebrow">{tr('Akademik profil', 'Academic profile')}</span>
            <h2 id="major-prompt-title">{tr('Bölümünüzü seçin', 'Select your major')}</h2>
          </div>
          {onClose && (
            <button className="major-prompt-close" type="button" onClick={onClose} aria-label={tr('Kapat', 'Close')}>×</button>
          )}
        </header>

        <div className="major-prompt-faculties">
          {groups.length === 0 ? (
            <p className="major-prompt-loading">{tr('Bölümler yükleniyor…', 'Loading majors…')}</p>
          ) : groups.map(group => (
            <section className="major-prompt-faculty" key={group.id}>
              <h3>{group.label}</h3>
              <div className="major-prompt-programs">
                {group.programs.map(program => (
                  <button
                    key={program.value}
                    type="button"
                    className={selectedMajor === program.value ? 'major-prompt-program-active' : ''}
                    onClick={() => onSelect(program.value)}
                  >
                    <span>{program.title || program.label}</span>
                    {selectedMajor === program.value && <span className="major-prompt-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="major-prompt-other">
          <h3>{tr('Diğer', 'Other')}</h3>
          <div>
            <button className={selectedMajor === 'master' ? 'major-prompt-program-active' : ''} type="button" onClick={() => onSelect('master')}>Master</button>
            <button className={selectedMajor === 'doctorate' ? 'major-prompt-program-active' : ''} type="button" onClick={() => onSelect('doctorate')}>{tr('Doktora', 'Doctorate')}</button>
            <button className={selectedMajor === 'none' ? 'major-prompt-program-active' : ''} type="button" onClick={() => onSelect('none')}>
              {tr('Paylaşmak istemiyorum', 'I prefer not to share')}
            </button>
          </div>
        </section>
      </section>
    </div>
  )
}

export default MajorPrompt
