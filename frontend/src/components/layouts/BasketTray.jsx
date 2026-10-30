const DAYS = [
  { id: 'Pazartesi', tr: 'Pzt', en: 'Mon', fullTr: 'Pazartesi', fullEn: 'Monday' },
  { id: 'Salı', tr: 'Sal', en: 'Tue', fullTr: 'Salı', fullEn: 'Tuesday' },
  { id: 'Çarşamba', tr: 'Çar', en: 'Wed', fullTr: 'Çarşamba', fullEn: 'Wednesday' },
  { id: 'Perşembe', tr: 'Per', en: 'Thu', fullTr: 'Perşembe', fullEn: 'Thursday' },
  { id: 'Cuma', tr: 'Cum', en: 'Fri', fullTr: 'Cuma', fullEn: 'Friday' },
]

/* Design 2's checkout bar: everything needed to go from "these courses" to
   "show me schedules" in one strip pinned to the bottom of the screen. */
function BasketTray({ language, basket, totalCredits, onRemoveCourse, freeDays, setFreeDays, onGenerate, generating, basketOpen, onToggleBasket }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  const toggleDay = id => setFreeDays(prev => prev.includes(id) ? prev.filter(day => day !== id) : [...prev, id])

  return (
    <div className="basket-tray" role="region" aria-label={tr('Sepet ve program oluşturma', 'Basket and schedule generation')}>
      <div className="basket-tray-inner">
        <button
          type="button"
          className={`tray-basket-toggle ${basketOpen ? 'tray-basket-toggle-open' : ''}`}
          onClick={onToggleBasket}
          aria-expanded={basketOpen}
        >
          <span className="tray-count">{basket.length}</span>
          <span className="tray-basket-copy">
            <strong>{tr('Sepet', 'Basket')}</strong>
            <span>{totalCredits} {tr('Kredi', 'ECTS')}</span>
          </span>
        </button>

        <ul className="tray-chips" aria-label={tr('Sepetteki dersler', 'Courses in basket')}>
          {basket.length === 0 && <li className="tray-empty">{tr('Henüz ders yok. Yukarıdan ara ve ekle.', 'No courses yet. Search above and add some.')}</li>}
          {basket.map(item => (
            <li key={item.code} className="tray-chip">
              <span className="tray-chip-code">{item.code}</span>
              {item.sections?.length > 0 && (
                <span className="tray-chip-meta">{item.sections.length} {tr('şube', item.sections.length === 1 ? 'section' : 'sections')}</span>
              )}
              <button type="button" className="tray-chip-remove" onClick={() => onRemoveCourse(item.code)} aria-label={tr(`${item.code} dersini çıkar`, `Remove ${item.code}`)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </li>
          ))}
        </ul>

        <div className="tray-days" role="group" aria-label={tr('Boş kalmasını istediğin günler', 'Days you want free')}>
          <span className="tray-days-label">{tr('Boş gün', 'Free day')}</span>
          {DAYS.map(day => {
            const active = freeDays.includes(day.id)
            return (
              <button
                key={day.id}
                type="button"
                className={`tray-day ${active ? 'tray-day-active' : ''}`}
                aria-pressed={active}
                title={language === 'tr' ? day.fullTr : day.fullEn}
                onClick={() => toggleDay(day.id)}
              >
                {language === 'tr' ? day.tr : day.en}
              </button>
            )
          })}
        </div>

        <button type="button" className="btn btn-primary tray-generate" onClick={onGenerate} disabled={generating}>
          {generating ? tr('Oluşturuluyor…', 'Generating…') : tr('Program Oluştur', 'Generate')}
        </button>
      </div>
    </div>
  )
}

export default BasketTray
