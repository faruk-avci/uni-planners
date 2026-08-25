/* eslint-disable react/prop-types */
import { useEffect } from 'react'
import './CorequisitePrompt.css'

function CorequisitePrompt({ prompt, language, onCancel, onContinue, onAddCorequisite }) {
  const tr = (turkish, english) => language === 'tr' ? turkish : english

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="coreq-prompt-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <section className="coreq-prompt" role="dialog" aria-modal="true" aria-labelledby="coreq-prompt-title">
        <header className="coreq-prompt-header">
          <div>
            <span className="coreq-prompt-eyebrow">{tr('Eksik yan koşul', 'Missing corequisite')}</span>
            <h2 id="coreq-prompt-title">
              {tr('Sepetinizde eksik yan koşul var.', 'Your basket has a missing corequisite.')}
            </h2>
            <p>{tr(
              'Programı oluşturmadan önce yan koşul dersini ekleyebilirsiniz.',
              'You can add the corequisite before generating your schedule.'
            )}</p>
          </div>
          <button className="coreq-prompt-close" type="button" onClick={onCancel} aria-label={tr('Kapat', 'Close')}>×</button>
        </header>

        <div className="coreq-prompt-body">
          {prompt.corequisites.map(course => (
            <article className="coreq-course" key={course.code}>
              <div className="coreq-course-heading">
                <div>
                  <strong>{course.code}</strong>
                  <span>{course.name}</span>
                </div>
                <button type="button" className="coreq-whole-button" onClick={() => onAddCorequisite(course)}>
                  {tr('Ekle', 'Add')}
                </button>
              </div>
            </article>
          ))}
        </div>

        <footer className="coreq-prompt-actions">
          <button className="btn btn-secondary" type="button" onClick={onContinue}>
            {tr('Yine de programı oluştur', 'Generate anyway')}
          </button>
        </footer>
      </section>
    </div>
  )
}

export default CorequisitePrompt
