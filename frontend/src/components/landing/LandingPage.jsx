import { UNIVERSITIES } from '../../data/universities'
import './LandingPage.css'

const DAYS = {
  tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
}
const HOURS = ['08:40', '09:40', '10:40', '11:40', '12:40', '13:40', '14:40', '15:40']

// Synthetic demonstration week (labelled as an example on the page). `row` is
// the starting hour index, `span` the number of hours, `tone` the block color.
const DEMO_BLOCKS = [
  { code: 'CS 201', section: 'A', day: 0, row: 2, span: 2, tone: 'accent' },
  { code: 'CS 201L', section: '2', day: 4, row: 0, span: 2, tone: 'accent' },
  { code: 'MATH 211', section: 'B', day: 2, row: 4, span: 2, tone: 'info' },
  { code: 'EE 201', section: 'A', day: 3, row: 3, span: 3, tone: 'success' },
  { code: 'HIST 201', section: 'C', day: 1, row: 1, span: 2, tone: 'warning' },
]
const DEMO_CONFLICT = { code: 'PHYS 101', section: 'B', day: 2, row: 5, span: 2 }

function ArrowIcon() {
  return (
    <svg className="landing-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

function LandingPage({ language, toggleLanguage, darkMode, onToggleDarkMode, onOpenUniversity, footerCredit }) {
  const tr = (trText, enText) => (language === 'tr' ? trText : enText)

  return (
    <div className="landing">
      <header className="landing-bar">
        <a className="landing-wordmark" href="/" aria-label="UniPlanners">UniPlanners</a>
        <div className="landing-bar-actions">
          <button
            type="button"
            className="landing-icon-btn"
            onClick={onToggleDarkMode}
            aria-pressed={darkMode}
            aria-label={darkMode ? tr('Aydınlık moda geç', 'Switch to light mode') : tr('Karanlık moda geç', 'Switch to dark mode')}
          >
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button type="button" className="landing-icon-btn landing-lang" onClick={toggleLanguage} title={tr('Switch to English', "Türkçe'ye geç")}>
            {language === 'tr' ? 'EN' : 'TR'}
          </button>
        </div>
      </header>

      <main>
        <section className="landing-index" aria-labelledby="landing-title">
          <div className="landing-intro">
            <h1 id="landing-title">{tr('Üniversiteni seç.', 'Choose your university.')}</h1>
            <p>
              {tr(
                'Derslerini ekle, şubeleri seç; UniPlanners çakışmayan tüm haftalık programları saniyeler içinde çıkarsın.',
                'Add your courses, pick sections, and UniPlanners lays out every clash-free weekly schedule in seconds.'
              )}
            </p>
          </div>
          <ul className="landing-unis">
            {UNIVERSITIES.map(uni => {
              const live = uni.status === 'live'
              const content = (
                <>
                  <span className="landing-uni-name" lang="tr">
                    {uni.short}
                    {live && <ArrowIcon />}
                  </span>
                </>
              )
              return (
                <li key={uni.slug} className={`landing-uni ${live ? 'landing-uni-live' : 'landing-uni-soon'}`}>
                  {live ? (
                    <a
                      href={`/${uni.slug}`}
                      className="landing-uni-row"
                      aria-label={`${uni.name[language] || uni.name.tr} - ${tr('planlayıcıyı aç', 'open planner')}`}
                      onClick={event => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                        event.preventDefault()
                        onOpenUniversity(uni.slug)
                      }}
                    >
                      {content}
                    </a>
                  ) : (
                    <div className="landing-uni-row" aria-disabled="true" aria-label={`${uni.name[language] || uni.name.tr} - ${tr('yakında', 'coming soon')}`}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="landing-proof" aria-labelledby="landing-proof-title">
          <div className="landing-proof-copy">
            <h2 id="landing-proof-title">{tr('Nasıl çalışır', 'How it works')}</h2>
            <ol className="landing-steps">
              <li>
                <h3>{tr('Dersleri ekle', 'Add courses')}</h3>
                <p>{tr('Ders kodunu yaz; dersin tamamını ya da yalnızca istediğin şubeleri sepete at.', 'Type a course code, then add the whole course or only the sections you want.')}</p>
              </li>
              <li>
                <h3>{tr('Kısıtlarını belirt', 'Set your constraints')}</h3>
                <p>{tr('Boş kalmasını istediğin günleri seç; eksik yan koşulları sana hatırlatırız.', 'Pick the days you want free; we remind you about missing corequisites.')}</p>
              </li>
              <li>
                <h3>{tr('Programları gez', 'Browse schedules')}</h3>
                <p>{tr('Çakışmayan her kombinasyon önüne gelir; beğendiğini paylaş, takvime ekle ya da görsel olarak indir.', 'Every clash-free combination is laid out for you; share the one you like, add it to your calendar, or download it as an image.')}</p>
              </li>
            </ol>
          </div>

          <figure className="landing-demo">
            <div className="landing-demo-grid" role="img" aria-label={tr('Örnek çakışmasız haftalık program', 'Example clash-free weekly schedule')}>
              <span className="landing-demo-corner" />
              {DAYS[language].map(day => <span key={day} className="landing-demo-day">{day}</span>)}
              {HOURS.map((hour, index) => (
                <span key={hour} className="landing-demo-hour" style={{ gridRow: index + 2 }}>{hour}</span>
              ))}
              {DEMO_BLOCKS.map((block, index) => (
                <span
                  key={block.code}
                  className={`landing-demo-block landing-tone-${block.tone}`}
                  style={{ gridColumn: block.day + 2, gridRow: `${block.row + 2} / span ${block.span}`, '--i': index }}
                >
                  <strong>{block.code}</strong> {block.section}
                </span>
              ))}
              <span
                className="landing-demo-block landing-demo-conflict"
                style={{ gridColumn: DEMO_CONFLICT.day + 2, gridRow: `${DEMO_CONFLICT.row + 2} / span ${DEMO_CONFLICT.span}` }}
              >
                <strong>{DEMO_CONFLICT.code}</strong> {DEMO_CONFLICT.section}
                <em>{tr('çakışıyor', 'clashes')}</em>
              </span>
            </div>
          </figure>
        </section>
      </main>

      <footer className="landing-footer">
        <p>{tr(
          'UniPlanners bağımsız bir öğrenci projesidir; listelenen üniversitelerle resmi bir bağı yoktur. Ders kaydı yalnızca üniversitenin resmi sistemi üzerinden yapılır.',
          'UniPlanners is an independent student project and is not affiliated with the universities listed. Course registration is done only through the university’s official system.'
        )}</p>
        <p className="landing-credit">{footerCredit}</p>
      </footer>
    </div>
  )
}

export default LandingPage
