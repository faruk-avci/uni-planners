import './FreeDaySelector.css'

const DAYS = [
  { id: 'Pazartesi', tr: 'Pazartesi', en: 'Monday' },
  { id: 'Salı', tr: 'Salı', en: 'Tuesday' },
  { id: 'Çarşamba', tr: 'Çarşamba', en: 'Wednesday' },
  { id: 'Perşembe', tr: 'Perşembe', en: 'Thursday' },
  { id: 'Cuma', tr: 'Cuma', en: 'Friday' },
]

function FreeDaySelector({ freeDays, setFreeDays, language }) {
  const toggle = (dayId) => {
    setFreeDays(prev =>
      prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    )
  }

  return (
    <div className="freeday-panel section-new">
      <div className="freeday-header">
        <h3 className="freeday-title">
          {language === 'tr' ? 'Boş Gün Seçimi' : 'Free Day Selection'}
        </h3>
        <span className="badge badge-new">{language === 'tr' ? 'Yeni' : 'New'}</span>
      </div>
      <p className="freeday-desc">
        {language === 'tr'
          ? 'Derssiz istediğiniz günleri seçin'
          : 'Select days you want free of classes'}
      </p>
      <div className="freeday-chips">
        {DAYS.map(day => (
          <button
            key={day.id}
            className={`freeday-chip ${freeDays.includes(day.id) ? 'freeday-chip-active' : ''}`}
            onClick={() => toggle(day.id)}
          >
            {language === 'tr' ? day.tr : day.en}
          </button>
        ))}
      </div>
      {freeDays.length >= 3 && (
        <p className="freeday-warn">
          {language === 'tr'
            ? '3+ boş gün seçenekleri ciddi şekilde kısıtlar'
            : '3+ free days severely limits schedule options'}
        </p>
      )}
    </div>
  )
}

export default FreeDaySelector
