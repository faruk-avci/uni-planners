const DAYS = {
  tr: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
}
const HOURS = ['08:40', '09:40', '10:40', '11:40', '12:40', '13:40', '14:40', '15:40', '16:40', '17:40']

/* Design 3's right pane before anything is generated: the week the student is
   about to fill, so the screen already shows where the result will land. */
function WeekPlaceholder({ language, basketCount, onGenerate, generating }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  return (
    <section className="week-placeholder" aria-label={tr('Haftalık program', 'Weekly schedule')}>
      <div className="week-placeholder-grid" aria-hidden="true">
        <span />
        {DAYS[language].map(day => <span key={day} className="week-placeholder-day">{day}</span>)}
        {HOURS.map(hour => (
          <span key={hour} className="week-placeholder-row">
            <span className="week-placeholder-hour">{hour}</span>
          </span>
        ))}
      </div>
      <div className="week-placeholder-message">
        <h2>{basketCount > 0 ? tr('Haftan hazır olmayı bekliyor', 'Your week is ready to be built') : tr('Haftan burada görünecek', 'Your week will appear here')}</h2>
        <p>
          {basketCount > 0
            ? tr(`Sepetinde ${basketCount} ders var. Çakışmayan programları görmek için oluştur.`, `You have ${basketCount} courses in your basket. Generate to see every clash-free schedule.`)
            : tr('Soldan derslerini ara ve sepete ekle; sonra Program Oluştur’a bas.', 'Search for courses on the left, add them to your basket, then press Generate.')}
        </p>
        {basketCount > 0 && (
          <button type="button" className="btn btn-primary" onClick={onGenerate} disabled={generating}>
            {generating ? tr('Oluşturuluyor…', 'Generating…') : tr('Program Oluştur', 'Generate schedules')}
          </button>
        )}
      </div>
    </section>
  )
}

export default WeekPlaceholder
