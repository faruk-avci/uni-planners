import { useEffect, useMemo, useState } from 'react'
import { request, formatDate } from '../api.js'
import { Notice, PageHeader, ReadOnlyNote, Section, useLoad } from '../ui.jsx'

const TYPE_LABELS = { scale: 'Puan ölçeği', multi: 'Çoklu seçim', text: 'Açık uçlu metin', email: 'E-posta' }

// Same field order the API stores, so "did the questions change?" compares
// like with like.
function normalizeQuestion(q) {
  const base = { key: q.key, type: q.type, required: Boolean(q.required), label: { tr: q.label?.tr?.trim() || '', en: q.label?.en?.trim() || '' } }
  const hint = { tr: q.hint?.tr?.trim() || '', en: q.hint?.en?.trim() || '' }
  if (hint.tr || hint.en) base.hint = hint
  if (q.type === 'scale') return { ...base, min: Number(q.min), max: Number(q.max) }
  if (q.type === 'multi') return { ...base, options: (q.options || []).map(o => ({ value: o.value, tr: o.tr?.trim() || '', en: o.en?.trim() || '' })), allowOther: Boolean(q.allowOther) }
  return { ...base, maxLength: Number(q.maxLength) || (q.type === 'email' ? 200 : 1000) }
}

const nextKey = (prefix, used) => {
  let n = 1
  while (used.has(`${prefix}_${n}`)) n++
  return `${prefix}_${n}`
}

function newQuestion(type, questions) {
  const key = nextKey('soru', new Set(questions.map(q => q.key)))
  const base = { key, type, required: false, label: { tr: '', en: '' } }
  if (type === 'scale') return { ...base, required: true, min: 1, max: 5 }
  if (type === 'multi') return { ...base, options: [{ value: 'secenek_1', tr: '', en: '' }], allowOther: false }
  return { ...base, maxLength: type === 'email' ? 200 : 1000 }
}

function Bilingual({ label, value, onChange, max, multiline = false, required = true }) {
  const Field = multiline ? 'textarea' : 'input'
  return (
    <div className="bilingual">
      <span>{label}</span>
      <div>
        <label><small>TR</small><Field value={value?.tr || ''} maxLength={max} rows={multiline ? 2 : undefined} required={required} onChange={event => onChange({ ...value, tr: event.target.value })} /></label>
        <label><small>EN</small><Field value={value?.en || ''} maxLength={max} rows={multiline ? 2 : undefined} required={required} onChange={event => onChange({ ...value, en: event.target.value })} /></label>
      </div>
    </div>
  )
}

function QuestionCard({ question, index, count, onChange, onMove, onRemove }) {
  const set = patch => onChange({ ...question, ...patch })
  const setOption = (i, patch) => set({ options: question.options.map((option, j) => (j === i ? { ...option, ...patch } : option)) })
  return (
    <article className="question-card">
      <header>
        <span className="question-number">{index + 1}</span>
        <select value={question.type} onChange={event => onChange({ ...newQuestion(event.target.value, []), key: question.key, label: question.label, hint: question.hint, required: question.required })} aria-label="Soru tipi">
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="question-key"><small>Anahtar</small><input value={question.key} maxLength={40} pattern="[a-z][a-z0-9_]*" onChange={event => set({ key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} required /></label>
        <label className="check"><input type="checkbox" checked={question.required} onChange={event => set({ required: event.target.checked })} />Zorunlu</label>
        <div className="question-tools">
          <button type="button" className="icon-button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Yukarı taşı">↑</button>
          <button type="button" className="icon-button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Aşağı taşı">↓</button>
          <button type="button" className="icon-button danger" onClick={onRemove} disabled={count === 1} aria-label="Soruyu sil">×</button>
        </div>
      </header>
      <Bilingual label="Soru metni" value={question.label} max={300} multiline onChange={label => set({ label })} />
      <details className="question-hint" open={Boolean(question.hint?.tr || question.hint?.en)}>
        <summary>İpucu (isteğe bağlı)</summary>
        <Bilingual label="İpucu" value={question.hint} max={200} required={false} onChange={hint => set({ hint })} />
      </details>
      {question.type === 'scale' && (
        <div className="inline-fields">
          <label><small>En düşük</small><select value={question.min} onChange={event => set({ min: Number(event.target.value) })}><option value={0}>0</option><option value={1}>1</option></select></label>
          <label><small>En yüksek</small><select value={question.max} onChange={event => set({ max: Number(event.target.value) })}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <div className="scale-preview">{Array.from({ length: question.max - question.min + 1 }, (_, i) => <span key={i}>{question.min + i}</span>)}</div>
        </div>
      )}
      {question.type === 'multi' && (
        <div className="options-editor">
          {question.options.map((option, i) => (
            <div className="option-row" key={i}>
              <input value={option.value} aria-label="Seçenek anahtarı" maxLength={40} required onChange={event => setOption(i, { value: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
              <input value={option.tr} placeholder="Türkçe" maxLength={200} required onChange={event => setOption(i, { tr: event.target.value })} />
              <input value={option.en} placeholder="English" maxLength={200} required onChange={event => setOption(i, { en: event.target.value })} />
              <button type="button" className="icon-button danger" disabled={question.options.length === 1} onClick={() => set({ options: question.options.filter((_, j) => j !== i) })} aria-label="Seçeneği sil">×</button>
            </div>
          ))}
          <div className="options-footer">
            <button type="button" className="secondary-button small" disabled={question.options.length >= 20} onClick={() => set({ options: [...question.options, { value: nextKey('secenek', new Set(question.options.map(o => o.value))), tr: '', en: '' }] })}>+ Seçenek</button>
            <label className="check"><input type="checkbox" checked={question.allowOther} onChange={event => set({ allowOther: event.target.checked })} />“Diğer” kutusu göster</label>
          </div>
        </div>
      )}
      {(question.type === 'text' || question.type === 'email') && (
        <div className="inline-fields">
          <label><small>En fazla karakter</small><input type="number" min={1} max={2000} value={question.maxLength} onChange={event => set({ maxLength: Number(event.target.value) })} /></label>
        </div>
      )}
    </article>
  )
}

export default function SurveyEditor({ university, role }) {
  const path = `/u/${university.slug}/survey`
  const { data, error, reload } = useLoad(() => request(path), [university.slug])
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const canEdit = role === 'editor'

  useEffect(() => { if (data) setDraft(structuredClone(data.survey)) }, [data])
  useEffect(() => setNotice(null), [university.slug])

  const survey = data?.survey
  const questionsChanged = useMemo(() => Boolean(draft && survey) && JSON.stringify(draft.questions.map(normalizeQuestion)) !== JSON.stringify(survey.questions.map(normalizeQuestion)), [draft, survey])
  const otherChanged = Boolean(draft && survey) && (JSON.stringify(draft.title) !== JSON.stringify(survey.title) || draft.active !== survey.active)
  const currentResponses = data?.versions.find(item => item.version === survey?.version)?.responses || 0

  const setQuestion = (index, question) => setDraft(current => ({ ...current, questions: current.questions.map((q, i) => (i === index ? question : q)) }))
  const move = (index, delta) => setDraft(current => {
    const questions = [...current.questions]
    const [item] = questions.splice(index, 1)
    questions.splice(index + delta, 0, item)
    return { ...current, questions }
  })

  const save = async event => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const result = await request(path, { method: 'PUT', body: { ...draft, questions: draft.questions.map(normalizeQuestion) } })
      await reload()
      setNotice({ type: 'success', text: result.newVersion ? `Kaydedildi. Yeni sürüm v${result.survey.version} başladı; önceki cevaplar kendi sürümlerinde duruyor.` : 'Kaydedildi.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Anket" subtitle={`${university.name} anketi: uniplanners.org/${university.slug}/anket`}>
        <a className="secondary-button link-like" href={`https://uniplanners.org/${university.slug}/anket`} target="_blank" rel="noopener noreferrer">Ankete git ↗</a>
      </PageHeader>
      <ReadOnlyNote role={role} />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {error && <div className="alert alert-error">{error}</div>}
      {survey && (
        <div className="stats-grid">
          <div className="stat-card"><span>Durum</span><strong className={survey.active ? 'text-ok' : 'text-off'}>{survey.active ? 'Açık' : 'Kapalı'}</strong><small>{survey.active ? 'Ziyaretçiler cevaplayabilir' : 'Sayfa “açık değil” gösterir'}</small></div>
          <div className="stat-card"><span>Yayındaki sürüm</span><strong>v{survey.version}</strong><small>{survey.updatedAt ? `${survey.updatedBy || '—'} · ${formatDate(survey.updatedAt)}` : 'Varsayılan sorular'}</small></div>
          <div className="stat-card"><span>Bu sürümdeki cevap</span><strong>{currentResponses}</strong><small>Tüm sürümler: {data.versions.reduce((sum, item) => sum + item.responses, 0)}</small></div>
        </div>
      )}
      {draft && (
        <form onSubmit={save}>
          <fieldset disabled={!canEdit} className="plain-fieldset">
            <Section icon="settings" title="Genel" description="Başlık ve açık/kapalı durumu sürümü değiştirmez.">
              <Bilingual label="Anket başlığı" value={draft.title} max={200} onChange={title => setDraft(current => ({ ...current, title }))} />
              <label className="toggle-row">
                <input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} />
                <span><strong>Anket açık</strong><small>Kapatınca anket sayfası “Bu anket şu anda açık değil” der; menü bağlantısını Site ayarlarından kaldırabilirsiniz.</small></span>
              </label>
            </Section>
            <Section icon="survey" title={`Sorular (${draft.questions.length})`} description="Anahtar, sonuçları ve dışa aktarımı bağlayan kısa addır; yayındaki bir sorunun anahtarını değiştirmeyin.">
              <div className="question-list">
                {draft.questions.map((question, index) => (
                  <QuestionCard
                    key={index}
                    question={question}
                    index={index}
                    count={draft.questions.length}
                    onChange={next => setQuestion(index, next)}
                    onMove={delta => move(index, delta)}
                    onRemove={() => setDraft(current => ({ ...current, questions: current.questions.filter((_, i) => i !== index) }))}
                  />
                ))}
              </div>
              {canEdit && draft.questions.length < 30 && (
                <div className="add-question">
                  <span>Soru ekle:</span>
                  {Object.entries(TYPE_LABELS).map(([type, label]) => (
                    <button type="button" key={type} className="secondary-button small" onClick={() => setDraft(current => ({ ...current, questions: [...current.questions, newQuestion(type, current.questions)] }))}>+ {label}</button>
                  ))}
                </div>
              )}
            </Section>
            {canEdit && (
              <div className={`sticky-save ${questionsChanged ? 'sticky-warn' : ''}`}>
                <span>
                  {questionsChanged
                    ? <><strong>Sorular değişti.</strong> Kaydedince v{survey.version + 1} başlar; v{survey.version} cevapları ({currentResponses}) ayrı kalır.</>
                    : otherChanged ? 'Başlık veya durum değişti; sürüm aynı kalır.' : 'Değişiklik yok.'}
                </span>
                <div className="settings-actions">
                  <button type="button" className="secondary-button" disabled={!questionsChanged && !otherChanged} onClick={() => setDraft(structuredClone(survey))}>Geri al</button>
                  <button className="primary-button" disabled={busy || (!questionsChanged && !otherChanged)}>{busy ? 'Kaydediliyor…' : questionsChanged ? `v${survey.version + 1} olarak yayınla` : 'Kaydet'}</button>
                </div>
              </div>
            )}
          </fieldset>
        </form>
      )}
    </>
  )
}
