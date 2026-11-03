import { useEffect, useRef, useState } from 'react'
import { request } from '../api.js'
import { PageHeader, Section, useLoad } from '../ui.jsx'

const POLL_MS = 4000
const MAX_ROWS = 200
const GRADE_LABELS = { prep: 'Hazırlık', '1': '1. sınıf', '2': '2. sınıf', '3': '3. sınıf', '4': '4. sınıf', '5+': '5. sınıf ve üzeri' }
const SOURCE_LABELS = { search: 'Arama', curriculum: 'Müfredat', curriculum_elective: 'Müfredat seçmeli', elective_popup: 'Seçmeli penceresi', fitting: 'Uyan dersler', coreq: 'Yan koşul' }

function BarList({ title, rows }) {
  const max = rows.reduce((best, row) => Math.max(best, row.value), 0) || 1
  return (
    <div className="bar-list">
      {title && <h3>{title}</h3>}
      {rows.length === 0 ? (
        <p className="empty-note">Henüz veri yok.</p>
      ) : (
        <div className="bar-rows">
          {rows.map(row => (
            <div className="bar-row" key={row.label}>
              <span className="bar-label" title={row.label}>{row.label}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} /></span>
              <span className="bar-value">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const RefreshButton = ({ onClick, loading }) => <button className="secondary-button" onClick={onClick} disabled={loading}>{loading ? 'Yükleniyor…' : 'Yenile'}</button>

// Visitor analytics of the university's planner (Özyeğin only so far).
export function UniversityAnalytics({ university }) {
  const base = `/u/${university.slug}/analytics`
  const majors = useLoad(() => request(`${base}/majors`), [base])
  const grades = useLoad(() => request(`${base}/grades`), [base])
  const [days, setDays] = useState(30)
  const sources = useLoad(() => request(`${base}/course-add-sources?days=${days}`), [base, days])

  return (
    <>
      <PageHeader title="Analitik" subtitle={`${university.name} planlayıcısını kullananların bölüm ve sınıf dağılımı.`} />
      <Section icon="results" title="Seçilen bölümler" description="İlk seçilen ve şu anda seçili olan bölüm." className="analytics-card" aside={<RefreshButton onClick={majors.reload} loading={majors.loading} />}>
        {majors.error && <div className="alert alert-error">{majors.error}</div>}
        {majors.data && (
          <div className="bar-list-grid">
            <BarList title="İlk seçilen bölüm" rows={majors.data.firstChoice.map(row => ({ label: row.major, value: row.visitors }))} />
            <BarList title="Güncel bölüm" rows={majors.data.current.map(row => ({ label: row.major, value: row.visitors }))} />
          </div>
        )}
      </Section>
      <div className="two-col">
        <Section icon="results" title="Sınıf dağılımı" className="analytics-card" aside={<RefreshButton onClick={grades.reload} loading={grades.loading} />}>
          {grades.error && <div className="alert alert-error">{grades.error}</div>}
          {grades.data && <BarList rows={grades.data.current.map(row => ({ label: GRADE_LABELS[row.grade] || row.grade, value: row.visitors }))} />}
        </Section>
        <Section
          icon="analytics"
          title="Dersler nereden eklendi"
          description={sources.data ? `Son ${sources.data.days} günde ${sources.data.total} ekleme` : ''}
          className="analytics-card"
          aside={<select className="compact-select" value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Dönem">{[7, 30, 90, 365].map(n => <option key={n} value={n}>Son {n} gün</option>)}</select>}
        >
          {sources.error && <div className="alert alert-error">{sources.error}</div>}
          {sources.data && <BarList rows={sources.data.sources.map(row => ({ label: SOURCE_LABELS[row.source] || row.source, value: row.additions }))} />}
        </Section>
      </div>
    </>
  )
}

function EventLog() {
  const [events, setEvents] = useState([])
  const [watching, setWatching] = useState(false)
  const [error, setError] = useState('')
  const sinceRef = useRef('')
  const timerRef = useRef(null)
  const seenRef = useRef(new Set())

  const poll = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (sinceRef.current) params.set('since', sinceRef.current)
      const data = await request(`/analytics/events?${params.toString()}`)
      if (data.events.length > 0) {
        sinceRef.current = data.events[0].created_at
        const fresh = data.events.filter(event => {
          const key = `${event.kind}:${event.id}`
          if (seenRef.current.has(key)) return false
          seenRef.current.add(key)
          return true
        })
        if (fresh.length > 0) setEvents(prev => [...fresh, ...prev].slice(0, MAX_ROWS))
      }
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleWatch = () => {
    if (watching) {
      clearInterval(timerRef.current)
      timerRef.current = null
      setWatching(false)
      return
    }
    setWatching(true)
    poll()
    timerRef.current = setInterval(poll, POLL_MS)
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  return (
    <Section
      icon="traffic"
      title="Etkinlik günlüğü"
      description="Site genelinde arama, ders ekleme, program oluşturma, bağlantı tıklamaları ve daha fazlası. Panel istekleri dahil değildir."
      className="analytics-card"
      aside={<button className={watching ? 'primary-button' : 'secondary-button'} onClick={toggleWatch}>{watching ? 'İzlemeyi durdur' : 'Canlı izlemeyi başlat'}</button>}
    >
      {error && <div className="alert alert-error">{error}</div>}
      {events.length === 0 ? (
        <p className="empty-note">{watching ? 'Yeni etkinlik bekleniyor…' : 'İzlemeyi başlatınca son etkinlikler burada görünür.'}</p>
      ) : (
        <div className="event-log-scroll">
          <table className="event-log-table">
            <thead><tr><th>Zaman</th><th>Tür</th><th>Eylem</th><th>Etiket</th><th>Oturum</th><th>Veri</th></tr></thead>
            <tbody>
              {events.map(event => (
                <tr key={`${event.kind}-${event.id}-${event.created_at}`}>
                  <td>{new Date(event.created_at).toLocaleTimeString('tr-TR')}</td>
                  <td>{event.category}</td>
                  <td>{event.action}</td>
                  <td>{event.label || '—'}</td>
                  <td>{event.session_id ? event.session_id.slice(0, 8) : '—'}</td>
                  <td className="event-log-data">{event.data ? JSON.stringify(event.data).slice(0, 80) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

// Site-wide traffic, including raw events: superadmin only.
export function Traffic() {
  const summary = useLoad(() => request('/analytics/summary'), [])
  return (
    <>
      <PageHeader title="Site trafiği" subtitle="Tüm site için ham etkinlikler. IP ve tarayıcı bilgisi içerdiği için yalnızca süper yöneticiler görür." />
      {summary.data && (
        <section className="stats-grid">
          <div className="stat-card"><span>Son 24 saatte aktif oturum</span><strong>{summary.data.activeSessions24h}</strong><small>Anonim ziyaretçi oturumu</small></div>
          <div className="stat-card"><span>Kayıtlı etkinlik</span><strong>{summary.data.totalEvents}</strong><small>Site etkinlikleri toplamı</small></div>
          <div className="stat-card"><span>En çok aranan</span><strong className="stat-text">{summary.data.topSearches[0]?.query || '—'}</strong><small>{summary.data.topSearches.slice(1, 4).map(item => item.query).join(', ') || 'Henüz arama yok'}</small></div>
        </section>
      )}
      {summary.error && <div className="alert alert-error">{summary.error}</div>}
      <EventLog />
    </>
  )
}
