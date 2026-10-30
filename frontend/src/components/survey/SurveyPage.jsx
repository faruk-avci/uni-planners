import { useEffect, useState } from 'react'
import { courseService } from '../../services/courseService'
import './SurveyPage.css'

function SurveyPage({ language, university, layout, onBack }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  const [state, setState] = useState({ status: 'loading', survey: null })
  const [answers, setAnswers] = useState({})
  const [missing, setMissing] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false
    courseService.getSurvey(university)
      .then(data => { if (!cancelled) setState({ status: data.submitted ? 'done' : 'ready', survey: data.survey, already: data.submitted }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', survey: null }) })
    return () => { cancelled = true }
  }, [university])

  const label = value => (value ? (value[language] || value.tr) : '')
  const setAnswer = (key, value) => {
    setAnswers(current => ({ ...current, [key]: value }))
    setMissing(current => current.filter(item => item !== key))
  }
  const toggleOption = (key, option) => {
    const current = answers[key] || { selected: [], other: '' }
    const selected = current.selected.includes(option)
      ? current.selected.filter(item => item !== option)
      : [...current.selected, option]
    setAnswer(key, { ...current, selected })
  }

  const submit = async event => {
    event.preventDefault()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const required = state.survey.questions.filter(question => {
      const value = answers[question.key]
      if (question.type === 'email' && value && !emailPattern.test(String(value).trim())) return true
      return question.required && (value === undefined || value === '')
    })
    if (required.length > 0) {
      setMissing(required.map(question => question.key))
      document.getElementById(`survey-q-${required[0].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    setSubmitError('')
    const result = await courseService.submitSurvey(university, answers, layout)
    setSubmitting(false)
    if (result.ok || result.status === 409) {
      setState(current => ({ ...current, status: 'done', already: result.status === 409 }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setSubmitError(tr('Cevapların gönderilemedi. Lütfen tekrar dene.', 'Your answers could not be sent. Please try again.'))
    }
  }

  // Standalone page: only the wordmark above the survey, no site chrome.
  const shell = content => (
    <div className="survey-shell">
      <div className="survey-brand">UniPlanners</div>
      {content}
    </div>
  )

  if (state.status === 'loading') {
    return shell(<main className="survey-page"><p className="survey-muted">{tr('Anket yükleniyor…', 'Loading survey…')}</p></main>)
  }
  if (state.status === 'error') {
    return shell(
      <main className="survey-page">
        <h1>{tr('Anket bulunamadı', 'Survey not found')}</h1>
        <p className="survey-muted">{tr('Bu anket şu anda açık değil.', 'This survey is not open right now.')}</p>
        <button type="button" className="survey-back" onClick={onBack}>{tr('Planlayıcıya dön', 'Back to the planner')}</button>
      </main>
    )
  }
  if (state.status === 'done') {
    return shell(
      <main className="survey-page survey-done">
        <h1>{state.already && !submitting ? tr('Bu anketi zaten doldurdun', 'You have already answered this survey') : tr('Teşekkürler!', 'Thank you!')}</h1>
        <p className="survey-muted">
          {tr('Cevapların UniPlanners’ı geliştirmemize doğrudan yardım ediyor.', 'Your answers directly help us improve UniPlanners.')}
        </p>
        <button type="button" className="survey-back" onClick={onBack}>{tr('Planlayıcıya dön', 'Back to the planner')}</button>
      </main>
    )
  }

  const { survey } = state
  return shell(
    <main className="survey-page">
      <header className="survey-header">
        <h1>{label(survey.title)}</h1>
      </header>

      <form className="survey-form" onSubmit={submit} noValidate>
        {survey.questions.map((question, index) => {
          const isMissing = missing.includes(question.key)
          return (
            <fieldset key={question.key} id={`survey-q-${question.key}`} className={`survey-question ${isMissing ? 'survey-question-missing' : ''}`}>
              <legend>
                <span className="survey-number">{index + 1}</span>
                <span>{label(question.label)}{question.required && <span className="survey-required" aria-label={tr('zorunlu', 'required')}> *</span>}</span>
              </legend>
              {question.hint && <p className="survey-hint">{label(question.hint)}</p>}

              {question.type === 'scale' && (
                <div className="survey-scale" role="radiogroup" aria-label={label(question.label)}>
                  {Array.from({ length: question.max - question.min + 1 }, (_, i) => question.min + i).map(score => (
                    <button
                      key={score}
                      type="button"
                      role="radio"
                      aria-checked={answers[question.key] === score}
                      className={`survey-scale-option ${answers[question.key] === score ? 'survey-scale-active' : ''}`}
                      onClick={() => setAnswer(question.key, score)}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              )}

              {question.type === 'multi' && (
                <div className="survey-options">
                  {question.options.map(option => {
                    const checked = Boolean(answers[question.key]?.selected?.includes(option.value))
                    return (
                      <label key={option.value} className={`survey-option ${checked ? 'survey-option-checked' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleOption(question.key, option.value)} />
                        <span>{language === 'tr' ? option.tr : option.en}</span>
                      </label>
                    )
                  })}
                  {question.allowOther && (
                    <input
                      type="text"
                      className="survey-other"
                      maxLength={200}
                      placeholder={tr('Diğer (isteğe bağlı)', 'Other (optional)')}
                      value={answers[question.key]?.other || ''}
                      onChange={event => setAnswer(question.key, { selected: answers[question.key]?.selected || [], other: event.target.value })}
                    />
                  )}
                </div>
              )}

              {question.type === 'email' && (
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="survey-other"
                  maxLength={question.maxLength}
                  placeholder={tr('ornek@ozu.edu.tr', 'name@example.com')}
                  value={answers[question.key] || ''}
                  onChange={event => setAnswer(question.key, event.target.value)}
                />
              )}

              {question.type === 'text' && (
                <div className="survey-text">
                  <textarea
                    rows={4}
                    maxLength={question.maxLength}
                    value={answers[question.key] || ''}
                    onChange={event => setAnswer(question.key, event.target.value)}
                    placeholder={tr('İsteğe bağlı', 'Optional')}
                  />
                  <span className="survey-counter">{(answers[question.key] || '').length}/{question.maxLength}</span>
                </div>
              )}

              {isMissing && (
                <p className="survey-error">
                  {question.type === 'email'
                    ? tr('Geçerli bir e-posta adresi yaz ya da bu alanı boş bırak.', 'Enter a valid e-mail address or leave this empty.')
                    : tr('Bu soruyu cevaplaman gerekiyor.', 'Please answer this question.')}
                </p>
              )}
            </fieldset>
          )
        })}

        {submitError && <p className="survey-error" role="alert">{submitError}</p>}
        <div className="survey-actions">
          <button type="submit" className="btn btn-primary survey-submit" disabled={submitting}>
            {submitting ? tr('Gönderiliyor…', 'Sending…') : tr('Gönder', 'Submit')}
          </button>
        </div>
      </form>
    </main>
  )
}

export default SurveyPage
