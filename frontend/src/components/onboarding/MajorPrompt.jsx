import { useEffect } from 'react'
import './MajorPrompt.css'

function MajorPrompt({ language, groups, onSelect }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  return (
    <div className="major-prompt-backdrop">
      <section className="major-prompt" role="dialog" aria-modal="true" aria-labelledby="major-prompt-title">
        <span className="major-prompt-eyebrow">{tr('Bir kerelik seçim', 'One-time choice')}</span>
        <h2 id="major-prompt-title">{tr('Bölümünüzü seçin', 'Select your major')}</h2>

        <div className="major-prompt-faculties">
          {groups.length === 0 ? (
            <p className="major-prompt-loading">{tr('Bölümler yükleniyor…', 'Loading majors…')}</p>
          ) : groups.map(group => (
            <section className="major-prompt-faculty" key={group.id}>
              <h3>{group.label}</h3>
              <div className="major-prompt-programs">
                {group.programs.map(program => (
                  <button key={program.value} type="button" onClick={() => onSelect(program.value)}>
                    {program.title || program.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="major-prompt-other">
          <h3>{tr('Diğer', 'Other')}</h3>
          <div>
            <button type="button" onClick={() => onSelect('master')}>Master</button>
            <button type="button" onClick={() => onSelect('doctorate')}>{tr('Doktora', 'Doctorate')}</button>
            <button type="button" onClick={() => onSelect('none')}>
              {tr('Paylaşmak istemiyorum', 'I prefer not to share')}
            </button>
          </div>
        </section>
      </section>
    </div>
  )
}

export default MajorPrompt
