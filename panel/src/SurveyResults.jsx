import { useState } from 'react'
import { request } from './App.jsx'

const UNIVERSITY = 'ozyegin'
const LAYOUT_LABELS = { 1: 'Klasik', 2: 'Odak', unknown: 'Bilinmiyor' }

function Bars({ rows }) {
  const max = rows.reduce((best, row) => Math.max(best, row.value), 0) || 1
  return (
    <div className="bar-rows">
      {rows.map(row => (
        <div className="bar-row" key={row.label}>
          <span className="bar-label" title={row.label}>{row.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} /></span>
          <span className="bar-value">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function SurveyResults() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      setData(await request(`/survey/${UNIVERSITY}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-card analytics-card" id="survey-results">
      <div className="section-heading">
        <div>
          <span className="step-number neutral">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></svg>
          </span>
          <div>
            <h2>Anket sonuçları</h2>
            <p>uniplanners.org/ozyegin/anket · anonim cevaplar (oturum, IP ve saat kaydedilmez).</p>
          </div>
        </div>
        <div className="settings-actions">
          <a className="secondary-button survey-export" href={`/api/admin/survey/${UNIVERSITY}/export.csv`}>CSV indir</a>
          <button className="secondary-button" onClick={load} disabled={busy}>{busy ? 'Yükleniyor…' : data ? 'Yenile' : 'Göster'}</button>
        </div>
      </div>

      {error && <p className="empty-note">{error}</p>}
      {!data && !error && <p className="empty-note">Sonuçları görmek için "Göster" düğmesine basın.</p>}

      {data && (
        <div className="survey-results">
          <div className="survey-summary">
            <div><strong>{data.total}</strong><span>cevap</span></div>
            {Object.entries(data.byLayout).map(([key, count]) => (
              <div key={key}><strong>{count}</strong><span>{LAYOUT_LABELS[key] || key}</span></div>
            ))}
          </div>

          {data.total === 0 ? (
            <p className="empty-note">Henüz cevap yok.</p>
          ) : data.questions.map(question => (
            <div className="survey-result-block" key={question.key}>
              <h3>{question.label}</h3>
              {question.type === 'scale' && (
                <>
                  <p className="survey-result-meta">
                    Ortalama <strong>{question.average === null ? '-' : question.average.toFixed(2)}</strong> / {question.max} · {question.answered} cevap
                  </p>
                  <Bars rows={Object.entries(question.counts).map(([score, count]) => ({ label: score, value: count }))} />
                </>
              )}
              {question.type === 'multi' && (
                <>
                  <p className="survey-result-meta">{question.answered} kişi en az bir seçenek işaretledi</p>
                  <Bars rows={[...question.options].sort((a, b) => b.count - a.count).map(option => ({ label: option.label, value: option.count }))} />
                  {question.other.length > 0 && (
                    <ul className="survey-text-answers">
                      {question.other.map((text, index) => <li key={index}>Diğer: {text}</li>)}
                    </ul>
                  )}
                </>
              )}
              {question.type === 'text' && (
                question.answers.length === 0 ? <p className="empty-note">Cevap yok.</p> : (
                  <ul className="survey-text-answers">
                    {question.answers.map((answer, index) => (
                      <li key={index}>
                        <p>{answer.text}</p>
                        <small>{answer.date} · {answer.major || 'bölüm yok'}{answer.grade ? ` · ${answer.grade === 'prep' ? 'Hazırlık' : `${answer.grade}. sınıf`}` : ''}{answer.layout ? ` · ${LAYOUT_LABELS[answer.layout]}` : ''}</small>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default SurveyResults
