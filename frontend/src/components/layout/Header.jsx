import SettingsMenu from './SettingsMenu'
import { linkTargetProps } from '../../utils/links'
import './Header.css'

const LAYOUTS = [
  {
    id: '1', tr: 'Klasik', en: 'Classic',
    icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  },
  {
    id: '2', tr: 'Odak', en: 'Focus',
    icon: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.35-4.35" /></>,
  },
]


function Header({
  language,
  toggleLanguage,
  colorTheme,
  setColorTheme,
  darkMode,
  onToggleDarkMode,
  activePage,
  onNavigate,
  onLogoClick,
  surveyUrl,
  onSurveyLinkClick,
  layout,
  onLayoutChange,
}) {

  const showLayoutSwitch = activePage === 'planner' && Boolean(onLayoutChange)
  const renderLayoutSwitch = extraClass => (
    <div className={`layout-switch ${extraClass}`} role="radiogroup" aria-label={language === 'tr' ? 'Görünüm' : 'View'}>
      {LAYOUTS.map(option => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={layout === option.id}
          className={`layout-switch-option ${layout === option.id ? 'layout-switch-active' : ''}`}
          onClick={() => onLayoutChange(option.id)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{option.icon}</svg>
          <span>{language === 'tr' ? option.tr : option.en}</span>
        </button>
      ))}
    </div>
  )

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          {/* Logo */}
          <button className="header-logo" type="button" onClick={onLogoClick} aria-label="UniPlanners" title="UniPlanners">
            <div className="logo-icon">

            </div>
            <span className="logo-text">UniPlanners</span>
          </button>

          {/* Nav */}
          <nav className="header-nav">
            <button type="button" onClick={() => onNavigate('planner')} className={`nav-link ${activePage === 'planner' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Planlayıcı' : 'Planner'}
            </button>
            <button type="button" onClick={() => onNavigate('curriculum')} className={`nav-link ${activePage === 'curriculum' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Müfredat' : 'Curriculum'}
            </button>
            <button type="button" onClick={() => onNavigate('recap')} className={`nav-link nav-link-secondary ${activePage === 'recap' ? 'nav-link-active' : ''}`}>
              {language === 'tr' ? 'Özet' : 'Recap'}
            </button>
            {surveyUrl && (
              <a href={surveyUrl} {...linkTargetProps(surveyUrl)} className="nav-link nav-link-secondary" onClick={onSurveyLinkClick}>
                {language === 'tr' ? 'Anket' : 'Survey'}
              </a>
            )}
          </nav>
        </div>

        {/* Actions */}
        <div className="header-actions">
          <button
            className={`action-btn howto-mobile ${activePage === 'recap' ? 'action-btn-active' : ''}`}
            type="button"
            onClick={() => onNavigate('recap')}
            title={language === 'tr' ? 'Dönem Özeti' : 'Semester Recap'}
            aria-label={language === 'tr' ? 'Özet' : 'Recap'}
          >
            {language === 'tr' ? 'Özet' : 'Recap'}
          </button>
          {surveyUrl && (
            <a href={surveyUrl} {...linkTargetProps(surveyUrl)} className="action-btn howto-mobile" onClick={onSurveyLinkClick}>
              {language === 'tr' ? 'Anket' : 'Survey'}
            </a>
          )}
          {showLayoutSwitch && renderLayoutSwitch('layout-switch-inline')}

          <SettingsMenu
            language={language}
            toggleLanguage={toggleLanguage}
            darkMode={darkMode}
            onToggleDarkMode={onToggleDarkMode}
            colorTheme={colorTheme}
            setColorTheme={setColorTheme}
          />
        </div>
      </div>
    </header>
  )
}

export default Header
