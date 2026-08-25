import { useEffect, useRef, useState } from 'react'
import SchedulePreview from '../schedule/SchedulePreview'
import { courseService } from '../../services/courseService'
import './SharedSchedulePage.css'

function SharedSchedulePage({ id, language, onHome }) {
  const [share, setShare] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingCalendar, setExportingCalendar] = useState(false)
  const requestedId = useRef(null)
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  useEffect(() => {
    if (!id || requestedId.current === id) return
    requestedId.current = id
    setLoading(true)
    setError('')
    courseService.getSharedSchedule(id)
      .then(setShare)
      .catch(() => setError(tr('Bu bağlantıya ait bir program bulunamadı.', 'No schedule was found for this link.')))
      .finally(() => setLoading(false))
  }, [id])

  const lessons = share?.schedule?.lessons || []
  const createdAt = share?.createdAt
    ? new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium' }).format(new Date(share.createdAt))
    : ''

  const downloadImage = async () => {
    if (!share?.schedule || exporting) return
    setExporting(true)
    try {
      const layout = window.matchMedia('(max-width: 768px)').matches ? 'agenda' : 'grid'
      const blob = await courseService.exportScheduleImage(share.schedule, language, layout)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `uniplanners-${share.id}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Shared schedule image export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  const downloadCalendar = async () => {
    if (!share?.schedule || exportingCalendar) return
    setExportingCalendar(true)
    try {
      const blob = await courseService.exportScheduleCalendar(share.schedule, language)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `uniplanners-${share.id}.ics`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Shared schedule calendar export failed:', error)
    } finally {
      setExportingCalendar(false)
    }
  }

  return (
    <main className="shared-page">
      <header className="shared-header">
        <button className="shared-brand" type="button" onClick={onHome} aria-label={tr('Ana sayfaya git', 'Go to homepage')}>
          <span>UP</span>
          <strong>UniPlanners</strong>
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onHome}>
          ← {tr('Ana Sayfa', 'Homepage')}
        </button>
      </header>

      {loading ? (
        <section className="shared-state">{tr('Paylaşılan program yükleniyor…', 'Loading shared schedule…')}</section>
      ) : error ? (
        <section className="shared-state shared-state-error">
          <h1>{tr('Program bulunamadı', 'Schedule not found')}</h1>
          <p>{error}</p>
          <button className="btn btn-primary" type="button" onClick={onHome}>{tr('Planlayıcıya Git', 'Open Planner')}</button>
        </section>
      ) : (
        <div className="shared-content">
          <section className="shared-intro">
            <div>
              <span className="shared-eyebrow">{tr('Paylaşılan program', 'Shared schedule')} · {share.id}</span>
              <h1>{tr('Ders Programı', 'Course Schedule')}</h1>
              <p>
                {lessons.length} {tr('ders', 'courses')} · {share.schedule.totalCredits} {tr('AKTS', 'ECTS')}
                {createdAt && ` · ${createdAt}`}
              </p>
            </div>
            <span className="shared-views">{share.viewCount} {tr('görüntülenme', 'views')}</span>
          </section>

          <section className="shared-card">
            <div className="shared-card-heading">
              <h2>{tr('Ders ve Şube Bilgileri', 'Course and Section Details')}</h2>
              {share.term && <span>{share.term}</span>}
            </div>
            <div className="shared-table-wrap">
              <table className="shared-course-table">
                <thead>
                  <tr>
                    <th>{tr('Ders', 'Course')}</th>
                    <th>{tr('Şube', 'Section')}</th>
                    <th>{tr('Öğretim Elemanı', 'Instructor')}</th>
                    <th>{tr('Saatler', 'Times')}</th>
                    <th>{tr('AKTS', 'ECTS')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((lesson, index) => (
                    <tr key={`${lesson.code}-${lesson.section}-${index}`}>
                      <td data-label={tr('Ders', 'Course')}><strong>{lesson.code}</strong><span>{lesson.name}</span></td>
                      <td data-label={tr('Şube', 'Section')}>{lesson.section}</td>
                      <td data-label={tr('Öğretim Elemanı', 'Instructor')}>{lesson.lecturer}</td>
                      <td data-label={tr('Saatler', 'Times')} className="shared-times">
                        {(lesson.times || []).map((time, timeIndex) => (
                          <span key={`${time.day}-${time.start}-${timeIndex}`}>{time.day} · {time.start}–{time.end}</span>
                        ))}
                      </td>
                      <td data-label={tr('AKTS', 'ECTS')}>{lesson.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="shared-card shared-timetable">
            <div className="shared-card-heading">
              <h2>{tr('Haftalık Program', 'Weekly Schedule')}</h2>
              <div className="shared-export-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={downloadCalendar} disabled={exportingCalendar}>
                  {exportingCalendar ? tr('Takvim hazırlanıyor…', 'Creating calendar…') : tr('Takvime Ekle', 'Add to Calendar')}
                </button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={downloadImage} disabled={exporting}>
                  {exporting ? tr('Hazırlanıyor…', 'Creating…') : tr('PNG Olarak İndir', 'Download PNG')}
                </button>
              </div>
            </div>
            <SchedulePreview language={language} schedules={[share.schedule]} readOnly />
          </section>
        </div>
      )}
    </main>
  )
}

export default SharedSchedulePage
