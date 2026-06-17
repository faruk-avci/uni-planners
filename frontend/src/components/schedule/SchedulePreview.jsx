import { Fragment } from 'react'
import './SchedulePreview.css'

const HOURS = ['08:40', '09:40', '10:40', '11:40', '12:40', '13:40', '14:40', '15:40', '16:40', '17:40', '18:40', '19:40']
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']
const DAY_ABBR = { 'Pazartesi': 'Pzt', 'Salı': 'Sal', 'Çarşamba': 'Çar', 'Perşembe': 'Per', 'Cuma': 'Cum' }
const DAY_COLORS = ['var(--day-mon)', 'var(--day-tue)', 'var(--day-wed)', 'var(--day-thu)', 'var(--day-fri)']

const hourIndex = (t) => parseInt(String(t).split(':')[0], 10) - 8

// Convert a schedule's lessons into renderable grid blocks.
// Each course gets a stable color so its blocks match across days.
function buildBlocks(schedule) {
  if (!schedule) return []
  const colorByCourse = {}
  let colorCursor = 0
  const blocks = []

  schedule.lessons.forEach(lesson => {
    if (!(lesson.code in colorByCourse)) {
      colorByCourse[lesson.code] = DAY_COLORS[colorCursor % DAY_COLORS.length]
      colorCursor++
    }
    const color = colorByCourse[lesson.code]

    lesson.times.forEach(t => {
      const day = DAYS.indexOf(t.day)
      if (day === -1) return // weekend / off-grid
      const startHour = hourIndex(t.start)
      const endHour = hourIndex(t.end)
      const duration = Math.max(1, endHour - startHour)
      if (startHour < 0 || startHour >= HOURS.length) return
      blocks.push({
        course: lesson.code,
        section: lesson.section.replace(lesson.code, '').trim() || lesson.section,
        day,
        startHour,
        duration: Math.min(duration, HOURS.length - startHour),
        color,
      })
    })
  })
  return blocks
}

function SchedulePreview({ language, schedules = [], current = 0, onPrev, onNext, onShowFits }) {
  const hasData = schedules.length > 0
  const schedule = hasData ? schedules[current] : null
  const blocks = buildBlocks(schedule)

  return (
    <div className="schedule-wrapper">
      <div className="schedule-nav">
        <button className="btn btn-ghost btn-sm" onClick={onPrev} disabled={!hasData || current === 0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          {language === 'tr' ? 'Önceki' : 'Previous'}
        </button>
        <span className="schedule-counter">
          {language === 'tr' ? 'Program' : 'Schedule'}{' '}
          <strong>{hasData ? current + 1 : 0}</strong> / {schedules.length}
          {schedule ? ` · ${schedule.totalCredits} ${language === 'tr' ? 'AKTS' : 'ECTS'}` : ''}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onNext} disabled={!hasData || current >= schedules.length - 1}>
          {language === 'tr' ? 'Sonraki' : 'Next'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="schedule-grid">
        <div className="grid-corner"></div>
        {DAYS.map(day => (
          <div key={day} className="grid-day-header">{DAY_ABBR[day]}</div>
        ))}

        {HOURS.map((hour, hourIdx) => (
          <Fragment key={hourIdx}>
            <div className="grid-time">{hour}</div>
            {DAYS.map((_, dayIdx) => {
              const block = blocks.find(b => b.day === dayIdx && b.startHour === hourIdx)
              if (block) {
                return (
                  <div
                    key={`cell-${dayIdx}-${hourIdx}`}
                    className="grid-block"
                    style={{ '--block-color': block.color, gridRow: `span ${block.duration}` }}
                  >
                    <span className="block-course">{block.course}</span>
                    <span className="block-section">{block.section}</span>
                  </div>
                )
              }
              const coveredBy = blocks.find(b => b.day === dayIdx && hourIdx > b.startHour && hourIdx < b.startHour + b.duration)
              if (coveredBy) return null
              return <div key={`cell-${dayIdx}-${hourIdx}`} className="grid-cell" />
            })}
          </Fragment>
        ))}
      </div>

      <div className="schedule-actions">
        <button className="btn btn-secondary btn-sm" onClick={onShowFits}>
          {language === 'tr' ? 'Bu programa uyan dersler' : 'Courses that fit this schedule'}
        </button>
        <button className="btn btn-ghost btn-sm">
          {language === 'tr' ? 'Ekran Görüntüsü' : 'Screenshot'}
        </button>
      </div>
    </div>
  )
}

export default SchedulePreview
