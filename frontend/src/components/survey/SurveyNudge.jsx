import './SurveyNudge.css'

function SurveyNudge({ language, surveyUrl, onFillSurvey, onDismiss }) {
  const tr = (a, b) => language === 'tr' ? a : b

  return (
    <div className="survey-nudge" role="status">
      <button type="button" className="survey-nudge-close" onClick={onDismiss} aria-label={tr('Kapat', 'Close')}>×</button>
      <strong>{tr('Nasıl gidiyor?', 'How’s it going?')}</strong>
      <span>{tr('30 saniyeni ayırıp kısa anketimizi doldurur musun?', 'Got 30 seconds for a quick survey?')}</span>
      <div className="survey-nudge-actions">
        <a
          href={surveyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
          onClick={onFillSurvey}
        >
          {tr('Anketi Doldur', 'Take the Survey')}
        </a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          {tr('Daha sonra', 'Maybe later')}
        </button>
      </div>
    </div>
  )
}

export default SurveyNudge
