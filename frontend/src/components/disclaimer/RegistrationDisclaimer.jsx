import { useEffect, useState } from 'react'
import { courseService } from '../../services/courseService'
import { UNIVERSITY_INFO } from '../../data/university'
import './RegistrationDisclaimer.css'

const COUNTDOWN_SECONDS = 5

// Deliberately not persisted anywhere: during course registration week this has
// to be acknowledged on every visit and every reload, not once per session.
function RegistrationDisclaimer() {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (secondsLeft <= 0) return undefined
    const timer = setTimeout(() => setSecondsLeft(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  useEffect(() => {
    if (acknowledged) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [acknowledged])

  if (acknowledged) return null

  const ready = secondsLeft <= 0

  return (
    <div className="disclaimer-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="disclaimer-card">
        <span className="disclaimer-badge">Önemli · Important</span>

        <h2 id="disclaimer-title" className="disclaimer-title">
          Bu site resmî ders kayıt sistemi değildir
        </h2>
        <h3 className="disclaimer-title-en">
          This is not the official course registration website
        </h3>

        <p className="disclaimer-text">
          <span className="disclaimer-lang">TR</span>
          UniPlanners, ders programı planlamanıza yardımcı olan bağımsız bir araçtır.
          Ders kaydınızı <strong>{UNIVERSITY_INFO.registrationSystem} üzerinden</strong> yapmanız gerekir. Kayıt
          öncesinde ders, şube ve saat bilgilerini {UNIVERSITY_INFO.registrationShort} üzerinden kontrol etmeniz önerilir.
        </p>
        <p className="disclaimer-text disclaimer-text-en">
          <span className="disclaimer-lang">EN</span>
          UniPlanners is an independent tool that helps you plan your weekly schedule. Your
          actual registration is completed <strong>on {UNIVERSITY_INFO.registrationSystem}</strong>. Before registering,
          it is recommended to check course, section and time details on {UNIVERSITY_INFO.registrationShort}.
        </p>

        <div className="disclaimer-actions">
          <button
            type="button"
            className="btn btn-primary disclaimer-button"
            onClick={() => {
              courseService.trackSiteEvent('disclaimer', 'acknowledged')
              setAcknowledged(true)
            }}
            disabled={!ready}
          >
            <span>{ready ? 'Okudum, anladım' : `Okudum, anladım (${secondsLeft})`}</span>
            <span className="disclaimer-button-en">I have read and understood</span>
          </button>

          <a
            className="btn btn-secondary disclaimer-button disclaimer-sis-link"
            href={UNIVERSITY_INFO.registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => courseService.trackSiteEvent('disclaimer', 'sis_click')}
          >
            <span>{UNIVERSITY_INFO.registrationShort}{UNIVERSITY_INFO.registrationShort === 'SIS' ? "'e" : "'a"} git</span>
            <span className="disclaimer-button-en">Go to {UNIVERSITY_INFO.registrationShort}</span>
          </a>
        </div>
      </div>
    </div>
  )
}

export default RegistrationDisclaimer
