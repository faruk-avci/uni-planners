import { useEffect, useRef, useState } from 'react'
import { request } from './App.jsx'

const POLL_MS = 4000
const MAX_ROWS = 200

function BarList({ title, rows }) {
  const max = rows.reduce((best, row) => Math.max(best, row.value), 0) || 1
  return (
    <div className="bar-list">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-note">Henüz veri yok.</p>
      ) : (
        <div className="bar-rows">
          {rows.map(row => (
            <div className="bar-row" key={row.label}>
              <span className="bar-label">{row.label}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} /></span>
              <span className="bar-value">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MajorsChart() {
  const [majors, setMajors] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadMajors = async () => {
    setBusy(true)
    setError('')
    try {
      setMajors(await request('/analytics/majors'))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-card analytics-card">
      <div className="section-heading">
        <div><span className="step-number neutral">◔</span><div><h2>Seçilen bölümler</h2><p>İlk seçilen ve şu anda seçili olan bölüm dağılımı.</p></div></div>
        <button className="secondary-button" onClick={loadMajors} disabled={busy}>{busy ? 'Yükleniyor…' : 'Yenile'}</button>
      </div>
      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {majors ? (
        <div className="bar-list-grid">
          <BarList title="İlk seçilen bölüm" rows={majors.firstChoice.map(row => ({ label: row.major, value: row.visitors }))} />
          <BarList title="Güncel bölüm" rows={majors.current.map(row => ({ label: row.major, value: row.visitors }))} />
        </div>
      ) : (
        <p className="empty-note">Veriyi görmek için "Yenile" düğmesine basın.</p>
      )}
    </section>
  )
}

const GRADE_LABELS = { prep: 'Hazırlık', '1': '1. sınıf', '2': '2. sınıf', '3': '3. sınıf', '4': '4. sınıf', '5+': '5. sınıf ve üzeri' }

function GradesChart() {
  const [grades, setGrades] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadGrades = async () => {
    setBusy(true)
    setError('')
    try {
      setGrades(await request('/analytics/grades'))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-card analytics-card">
      <div className="section-heading">
        <div><span className="step-number neutral">◔</span><div><h2>Sınıf dağılımı</h2><p>Kullanıcıların seçtiği sınıf/yıl dağılımı.</p></div></div>
        <button className="secondary-button" onClick={loadGrades} disabled={busy}>{busy ? 'Yükleniyor…' : 'Yenile'}</button>
      </div>
      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {grades ? (
        <BarList
          title="Sınıf/yıl"
          rows={grades.current.map(row => ({ label: GRADE_LABELS[row.grade] || row.grade, value: row.visitors }))}
        />
      ) : (
        <p className="empty-note">Veriyi görmek için "Yenile" düğmesine basın.</p>
      )}
    </section>
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
    <section className="content-card analytics-card">
      <div className="section-heading">
        <div><span className="step-number neutral">▤</span><div><h2>Etkinlik günlüğü</h2><p>Site genelinde arama, ders ekleme/çıkarma, program oluşturma, bağlantı tıklamaları ve daha fazlası.</p></div></div>
        <button className={watching ? 'primary-button' : 'secondary-button'} onClick={toggleWatch}>
          {watching ? 'İzlemeyi durdur' : 'Canlı izlemeyi başlat'}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {events.length === 0 ? (
        <p className="empty-note">{watching ? 'Yeni etkinlik bekleniyor…' : 'İzlemeyi başlatınca son etkinlikler burada görünür.'}</p>
      ) : (
        <div className="event-log-scroll">
          <table className="event-log-table">
            <thead>
              <tr><th>Zaman</th><th>Tür</th><th>Eylem</th><th>Etiket</th><th>Oturum</th><th>Veri</th></tr>
            </thead>
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
    </section>
  )
}

export default function Analytics() {
  return (
    <div id="analytics">
      <MajorsChart />
      <GradesChart />
      <EventLog />
    </div>
  )
}
