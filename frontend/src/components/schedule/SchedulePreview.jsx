import { Fragment, useEffect, useRef, useState } from 'react'
import './SchedulePreview.css'

const HOURS = ['08:40', '09:40', '10:40', '11:40', '12:40', '13:40', '14:40', '15:40', '16:40', '17:40', '18:40', '19:40']
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']
const DAY_ABBR = { 'Pazartesi': 'Pzt', 'Salı': 'Sal', 'Çarşamba': 'Çar', 'Perşembe': 'Per', 'Cuma': 'Cum' }
// Curated for clear separation on the schedule's light tinted blocks. Colors
// repeat only after 16 distinct courses and match the backend PNG exporter.
const COURSE_COLORS = [
  '#2563eb', '#16a34a', '#7c3aed', '#db2777',
  '#d97706', '#0891b2', '#dc2626', '#4f46e5',
  '#0f766e', '#ea580c', '#c026d3', '#65a30d',
  '#0284c7', '#059669', '#be123c', '#9333ea',
]

const hourIndex = (t) => parseInt(String(t).split(':')[0], 10) - 8

const normalizeSection = value => String(value || '').replace(/\s+/g, '').toUpperCase()
const timeSignature = lesson => (lesson?.times || [])
  .map(time => `${time.day}|${time.start}|${time.end}`)
  .sort()
  .join(';')

function buildChangedCourses(schedule, previousSchedule) {
  if (!schedule || !previousSchedule) return new Set()
  const previousByCourse = new Map(previousSchedule.lessons.map(lesson => [lesson.code, lesson]))

  return new Set(schedule.lessons.flatMap(lesson => {
    const previous = previousByCourse.get(lesson.code)
    if (!previous) return [lesson.code]
    const sectionChanged = normalizeSection(previous.section) !== normalizeSection(lesson.section)
    const timeChanged = timeSignature(previous) !== timeSignature(lesson)
    if (sectionChanged || timeChanged) return [lesson.code]
    return []
  }))
}

// Convert a schedule's lessons into renderable grid blocks.
// Each course gets a stable color so its blocks match across days.
function buildCourseColors(schedule) {
  const colors = new Map()
  for (const lesson of schedule?.lessons || []) {
    if (!colors.has(lesson.code)) {
      colors.set(lesson.code, COURSE_COLORS[colors.size % COURSE_COLORS.length])
    }
  }
  return colors
}

function buildBlocks(schedule, changedCourses = new Set(), colorByCourse = new Map()) {
  if (!schedule) return []
  const blocks = []

  schedule.lessons.forEach(lesson => {
    const color = colorByCourse.get(lesson.code) || COURSE_COLORS[0]

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
        changed: changedCourses.has(lesson.code),
      })
    })
  })
  return blocks
}

function SchedulePreview({ language, schedules = [], current = 0, onPrev, onNext, onShowFits, onShare, sharing = false, shareCopied = false, onExportImage, exportingImage = false, onExportCalendar, exportingCalendar = false, readOnly = false }) {
  const [viewMode, setViewMode] = useState('grid')
  const previousViewedIndex = useRef(current)
  const hasData = schedules.length > 0
  const schedule = hasData ? schedules[current] : null
  const previousSchedule = schedules[previousViewedIndex.current] || null
  const changedCourses = previousViewedIndex.current === current
    ? new Set()
    : buildChangedCourses(schedule, previousSchedule)
  const courseColors = buildCourseColors(schedule)
  const blocks = buildBlocks(schedule, changedCourses, courseColors)

  useEffect(() => {
    previousViewedIndex.current = current
  }, [current])
  const agendaDays = DAYS.map(day => ({
    day,
    items: (schedule?.lessons || []).flatMap(lesson =>
      lesson.times
        .filter(time => time.day === day)
        .map(time => ({
          course: lesson.code,
          section: lesson.section.replace(lesson.code, '').trim() || lesson.section,
          start: time.start,
          end: time.end,
          color: courseColors.get(lesson.code) || COURSE_COLORS[0],
          changed: changedCourses.has(lesson.code),
        }))
    ).sort((a, b) => a.start.localeCompare(b.start)),
  })).filter(group => group.items.length > 0)

  // Rendered both above and below the schedule content: on a long page
  // (especially on mobile, once you've scrolled down into the grid/agenda),
  // having Previous/Next only at the very top means scrolling all the way
  // back up just to switch schedules.
  const renderNav = position => (
    <div className={`schedule-nav schedule-nav-${position}`}>
      <button className="btn btn-ghost btn-sm" onClick={onPrev} disabled={!hasData || current === 0}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        <span className="schedule-nav-label">{language === 'tr' ? 'Önceki' : 'Previous'}</span>
      </button>
      <span className="schedule-counter">
        {language === 'tr' ? 'Program' : 'Schedule'}{' '}
        <strong>{hasData ? current + 1 : 0}</strong> / {schedules.length}
        {schedule ? ` · ${schedule.totalCredits} ${language === 'tr' ? 'AKTS' : 'ECTS'}` : ''}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={onNext} disabled={!hasData || current >= schedules.length - 1}>
        <span className="schedule-nav-label">{language === 'tr' ? 'Sonraki' : 'Next'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  )

  return (
    <div className="schedule-wrapper">
      {!readOnly && renderNav('top')}

      <div className="schedule-view-toggle" aria-label={language === 'tr' ? 'Program görünümü' : 'Schedule view'}>
        <button type="button" className={viewMode === 'agenda' ? 'active' : ''} onClick={() => setViewMode('agenda')}>
          {language === 'tr' ? 'Liste' : 'Agenda'}
        </button>
        <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
          {language === 'tr' ? 'Haftalık tablo' : 'Weekly grid'}
        </button>
      </div>

      {!readOnly && <div className="schedule-actions">
        <button className="btn btn-secondary btn-sm" onClick={onShowFits}>
          {language === 'tr' ? 'Bu programa uyan dersler' : 'Courses that fit this schedule'}
          <span className="badge badge-new">{language === 'tr' ? 'Yeni' : 'New'}</span>
        </button>
        <button className={`btn btn-secondary btn-sm ${shareCopied ? 'schedule-share-copied' : ''}`} onClick={onShare} disabled={!hasData || sharing || shareCopied}>
          {sharing
            ? (language === 'tr' ? 'Paylaşım hazırlanıyor…' : 'Creating share…')
            : shareCopied
              ? (language === 'tr' ? 'Bağlantı Kopyalandı ✓' : 'Link Copied ✓')
              : <>{language === 'tr' ? 'Programı Paylaş' : 'Share Schedule'} <span className="badge badge-new">{language === 'tr' ? 'Yeni' : 'New'}</span></>}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onExportCalendar} disabled={!hasData || exportingCalendar}>
          {exportingCalendar
            ? (language === 'tr' ? 'Takvim hazırlanıyor…' : 'Creating calendar…')
            : (language === 'tr' ? 'Takvime Ekle' : 'Add to Calendar')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => onExportImage(viewMode)} disabled={!hasData || exportingImage}>
          {exportingImage
            ? (language === 'tr' ? 'Görsel hazırlanıyor…' : 'Creating image…')
            : (language === 'tr' ? 'PNG Olarak İndir' : 'Download PNG')}
        </button>
      </div>}

      <div className={`schedule-grid-scroll ${viewMode !== 'grid' ? 'schedule-view-hidden' : ''}`}>
        <div className="schedule-grid" key={`grid-${current}`}>
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
                      className={`grid-block ${block.changed ? 'schedule-changed' : ''}`}
                      style={{ '--block-color': block.color, gridRow: `span ${block.duration}` }}
                      aria-label={block.course}
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
      </div>

      <div className={`schedule-agenda ${viewMode !== 'agenda' ? 'schedule-view-hidden' : ''}`} key={`agenda-${current}`}>
        {agendaDays.map(group => (
          <section className="agenda-day" key={group.day}>
            <h3>{DAY_ABBR[group.day]}</h3>
            <div className="agenda-lessons">
              {group.items.map((item, index) => (
                <div
                  className={`agenda-lesson ${item.changed ? 'schedule-changed' : ''}`}
                  style={{ '--lesson-color': item.color }}
                  key={`${item.course}-${item.section}-${item.start}-${index}`}
                >
                  <time>{item.start}<span>{item.end}</span></time>
                  <span className="agenda-marker" aria-hidden="true" />
                  <div>
                    <strong>{item.course}</strong>
                    <span>{item.section}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!readOnly && renderNav('bottom')}
    </div>
  )
}

export default SchedulePreview
