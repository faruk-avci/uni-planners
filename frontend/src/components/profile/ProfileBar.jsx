import { useState } from 'react'
import './ProfileBar.css'

const CATALOG_NOTICE_DISMISSED_KEY = 'uniplanner_catalog_notice_dismissed_version'

const GRADE_OPTIONS = [
  { value: 'prep', tr: 'Hazırlık', en: 'Preparatory' },
  { value: '1', tr: '1. sınıf', en: 'Year 1' },
  { value: '2', tr: '2. sınıf', en: 'Year 2' },
  { value: '3', tr: '3. sınıf', en: 'Year 3' },
  { value: '4', tr: '4. sınıf', en: 'Year 4' },
]

const universityClick = onUniversityClick => event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  onUniversityClick()
}

function GradeSelect({ grade, onGradeChange, language, emptyLabel, className = '' }) {
  return (
    <select value={grade} onChange={event => onGradeChange(event.target.value)} className={`${className} ${grade ? '' : 'context-placeholder'}`.trim()}>
      <option value="">{emptyLabel}</option>
      {GRADE_OPTIONS.map(option => (
        <option key={option.value} value={option.value}>{language === 'tr' ? option.tr : option.en}</option>
      ))}
    </select>
  )
}

/* University › Major › Year as one bar (design 1, and the workbench pane). */
export function ContextStrip({ language, majorLabel, grade, onMajorClick, onUniversityClick, onGradeChange, compact = false }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  return (
    <nav className={`context-strip ${compact ? 'context-strip-compact' : ''}`} aria-label={tr('Akademik profil', 'Academic profile')}>
      <a
        className="context-segment context-university"
        href="/"
        title={tr('Üniversiteyi değiştir', 'Change university')}
        aria-label={tr('Özyeğin Üniversitesi, üniversiteyi değiştir', 'Özyeğin University, change university')}
        onClick={universityClick(onUniversityClick)}
      >
        <span className="context-mark" aria-hidden="true">Ö</span>
        <span className="context-copy">
          <small>{tr('Üniversite', 'University')}</small>
          <strong>{tr('Özyeğin Üniversitesi', 'Özyeğin University')}</strong>
        </span>
        <span className="context-action">{tr('Değiştir', 'Change')}</span>
      </a>

      <ContextDivider />

      <button className="context-segment context-major" type="button" onClick={onMajorClick}>
        <span className="context-copy">
          <small>{tr('Bölüm', 'Major')}</small>
          <strong className={majorLabel ? '' : 'context-placeholder'}>{majorLabel || tr('Bölümünü seç', 'Select your major')}</strong>
        </span>
        <svg className="context-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>

      <ContextDivider />

      <label className="context-segment context-grade">
        <span className="context-copy">
          <small>{tr('Sınıf', 'Year')}</small>
          <GradeSelect grade={grade} onGradeChange={onGradeChange} language={language} emptyLabel={tr('İsteğe bağlı', 'Optional')} />
        </span>
        <svg className="context-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </label>
    </nav>
  )
}

/* The same profile, read as a sentence whose blanks are the controls (design 2). */
export function ContextSentence({ language, majorLabel, grade, onMajorClick, onUniversityClick, onGradeChange }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  const caret = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
  const uni = (
    <a className="sentence-blank" href="/" title={tr('Üniversiteyi değiştir', 'Change university')} onClick={universityClick(onUniversityClick)}>
      Özyeğin
    </a>
  )
  const majorBlank = (
    <button type="button" className={`sentence-blank ${majorLabel ? '' : 'sentence-blank-empty'}`} onClick={onMajorClick}>
      {majorLabel || tr('bölümünü seç', 'choose your major')}{caret}
    </button>
  )
  const gradeBlank = (
    <label className="sentence-blank sentence-select">
      <span className="sr-only">{tr('Sınıf', 'Year')}</span>
      <GradeSelect grade={grade} onGradeChange={onGradeChange} language={language} emptyLabel={tr('sınıfın?', 'your year?')} />
      {caret}
    </label>
  )
  return (
    <p className="context-sentence">
      {language === 'tr'
        ? <>{uni}’de {majorBlank} okuyorum <span aria-hidden="true">·</span> {gradeBlank}</>
        : <>I study {majorBlank} at {uni} <span aria-hidden="true">·</span> {gradeBlank}</>}
    </p>
  )
}

/* One slot for everything the site needs to say. */
export function NoticeRail({ language, announcementUrl, surveyUrl, catalogNotice, catalogNoticeUpdatedAt, inline = false }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText
  // Dismissal is keyed to *which* notice was dismissed (its updatedAt
  // timestamp), not just a yes/no flag -- so publishing a new notice from
  // the panel makes it reappear even for people who closed an earlier one.
  const [dismissedVersion, setDismissedVersion] = useState(() => {
    try {
      return localStorage.getItem(CATALOG_NOTICE_DISMISSED_KEY) || ''
    } catch {
      return ''
    }
  })
  const noticeVisible = Boolean(catalogNotice) && catalogNoticeUpdatedAt !== dismissedVersion

  const dismissNotice = () => {
    setDismissedVersion(catalogNoticeUpdatedAt)
    try {
      localStorage.setItem(CATALOG_NOTICE_DISMISSED_KEY, catalogNoticeUpdatedAt || '')
    } catch { /* private browsing / storage disabled -- dismissal just won't persist */ }
  }

  const lastUpdatedLabel = catalogNoticeUpdatedAt
    ? new Date(catalogNoticeUpdatedAt).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const notices = []
  if (noticeVisible) {
    notices.push({
      key: 'catalog',
      tone: 'info',
      icon: 'info',
      body: (
        <>
          {catalogNotice}
          {lastUpdatedLabel && <span className="notice-meta"> · {tr('güncellendi', 'updated')} {lastUpdatedLabel}</span>}
        </>
      ),
      onDismiss: dismissNotice,
    })
  }
  // One slot: a catalog notice takes the place of the regular links (official
  // site, survey) until it is dismissed, then those links come back.
  if (!noticeVisible && announcementUrl) {
    notices.push({
      key: 'announcement',
      tone: 'warning',
      icon: 'megaphone',
      body: tr('Bu site resmi ders kayıt sitesi değildir. Resmi duyurular ve ders kaydı için:', 'This is not the official course registration site. For official announcements and registration:'),
      link: { href: announcementUrl, label: tr('Resmi siteye git', 'Go to the official site'), external: true },
    })
  }
  if (!noticeVisible && surveyUrl) {
    notices.push({
      key: 'survey',
      tone: 'neutral',
      icon: 'survey',
      body: tr('Lütfen anketi doldurmayı unutmayın.', 'Please don’t forget to fill out our survey.'),
      link: { href: surveyUrl, label: tr('Ankete git', 'Go to survey'), external: true },
    })
  }

  if (notices.length === 0) return null
  return (
    <div className={`notice-rail ${inline ? 'notice-rail-inline' : ''}`}>
      {notices.map(notice => (
        <div key={notice.key} className={`notice notice-${notice.tone}`} role={notice.tone === 'info' ? 'status' : undefined}>
          <NoticeIcon name={notice.icon} />
          <p className="notice-body">
            {notice.body}
            {notice.link && (
              <>
                {' '}
                <a href={notice.link.href} target={notice.link.external ? '_blank' : undefined} rel={notice.link.external ? 'noopener noreferrer' : undefined} className="notice-link">
                  {notice.link.label}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                </a>
              </>
            )}
          </p>
          {notice.onDismiss && (
            <button type="button" className="notice-close" onClick={notice.onDismiss} aria-label={tr('Kapat', 'Close')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function ProfileBar(props) {
  return (
    <>
      <ContextStrip {...props} />
      <NoticeRail {...props} />
    </>
  )
}

function ContextDivider() {
  return <span className="context-divider" aria-hidden="true" />
}

const NOTICE_ICON_PATHS = {
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  survey: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></>,
}

function NoticeIcon({ name }) {
  return (
    <svg className="notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NOTICE_ICON_PATHS[name]}
    </svg>
  )
}

export default ProfileBar
