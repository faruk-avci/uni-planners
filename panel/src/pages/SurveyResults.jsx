import { useEffect, useState } from 'react'
import { request, formatDay } from '../api.js'
import { PageHeader, Section, useLoad } from '../ui.jsx'

const LAYOUT_LABELS = { 1: 'Klasik', 2: 'Odak', unknown: 'Bilinmiyor' }
const gradeLabel = grade => (grade === 'prep' ? 'Hazırlık' : `${grade}. sınıf`)

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

export default function SurveyResults({ university }) {
  const base = `/u/${university.slug}/survey`
  const meta = useLoad(() => request(base), [university.slug])
  const [version, setVersion] = useState(null)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setVersion(null); setResults(null) }, [university.slug])
  useEffect(() => { if (meta.data && version === null) setVersion(meta.data.survey.version) }, [meta.data, version])

  useEffect(() => {
    if (version === null) return
    setBusy(true)
    setError('')
    request(`${base}/results?version=${version}`)
      .then(setResults)
      .catch(err => setError(err.message))
      .finally(() => setBusy(false))
  }, [base, version])

  const versions = meta.data?.versions || []

  return (
    <>
      <PageHeader title="Anket sonuçları" subtitle={`${university.name} · anonim cevaplar (oturum, IP ve saat kaydedilmez).`}>
        {version !== null && <a className="secondary-button link-like" href={`/api/admin${base}/export.csv?version=${version}`}>CSV indir (v{version})</a>}
      </PageHeader>
      {versions.length > 1 && (
        <div className="version-tabs" role="tablist" aria-label="Anket sürümü">
          {[...versions].reverse().map(item => (
            <button key={item.version} role="tab" aria-selected={item.version === version} className={item.version === version ? 'active' : ''} onClick={() => setVersion(item.version)}>
              v{item.version}<small>{item.responses} cevap{item.savedAt ? ` · ${formatDay(item.savedAt)}` : ''}</small>
            </button>
          ))}
        </div>
      )}
      {(error || meta.error) && <div className="alert alert-error">{error || meta.error}</div>}
      {busy && !results && <p className="empty-note">Yükleniyor…</p>}
      {results && (
        <>
          <div className="survey-summary">
            <div><strong>{results.total}</strong><span>cevap (v{results.version})</span></div>
            {Object.entries(results.byLayout).map(([key, count]) => (
              <div key={key}><strong>{count}</strong><span>{LAYOUT_LABELS[key] || key}</span></div>
            ))}
          </div>
          {results.total === 0 ? (
            <p className="empty-note">Bu sürümde henüz cevap yok.</p>
          ) : results.questions.map(question => (
            <Section key={question.key} title={question.label} description={`${question.answered} cevap`} className="survey-result-block">
              {question.type === 'scale' && (
                <>
                  <p className="survey-result-meta">Ortalama <strong>{question.average === null ? '-' : question.average.toFixed(2)}</strong> / {question.max}</p>
                  <Bars rows={Object.entries(question.counts).map(([score, count]) => ({ label: score, value: count }))} />
                </>
              )}
              {question.type === 'multi' && (
                <>
                  <Bars rows={[...question.options].sort((a, b) => b.count - a.count).map(option => ({ label: option.label, value: option.count }))} />
                  {question.other.length > 0 && (
                    <ul className="survey-text-answers">{question.other.map((text, index) => <li key={index}>Diğer: {text}</li>)}</ul>
                  )}
                </>
              )}
              {(question.type === 'text' || question.type === 'email') && (
                question.answers.length === 0 ? <p className="empty-note">Cevap yok.</p> : (
                  <ul className="survey-text-answers">
                    {question.answers.map((answer, index) => (
                      <li key={index}>
                        <p>{answer.text}</p>
                        <small>{answer.date} · {answer.major || 'bölüm yok'}{answer.grade ? ` · ${gradeLabel(answer.grade)}` : ''}{answer.layout ? ` · ${LAYOUT_LABELS[answer.layout]}` : ''}</small>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </Section>
          ))}
        </>
      )}
    </>
  )
}
