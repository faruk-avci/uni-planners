import './Header.css'

function Header({ theme, toggleTheme, language, toggleLanguage }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          {/* Logo */}
          <div className="header-logo">
            <div className="logo-icon">

            </div>
            <span className="logo-text">UniPlanners</span>
            <span className="logo-badge">v2</span>
          </div>

          {/* Nav */}
          <nav className="header-nav">
            <a href="#" className="nav-link nav-link-active">
              {language === 'tr' ? 'Planlayıcı' : 'Planner'}
            </a>
            <a href="#" className="nav-link">
              {language === 'tr' ? 'Müfredat' : 'Curriculum'}
            </a>
            <a href="#" className="nav-link">
              {language === 'tr' ? 'Nasıl Kullanılır' : 'How to Use'}
            </a>
            <a href="#" className="nav-link">
              {language === 'tr' ? 'Anket' : 'Survey'}
            </a>
          </nav>
        </div>

        {/* Actions */}
        <div className="header-actions">
          <button
            className="action-btn"
            onClick={toggleLanguage}
            title={language === 'tr' ? 'Switch to English' : "Türkçe'ye geç"}
          >
            <span className="lang-toggle">
              {language === 'tr' ? 'EN' : 'TR'}
            </span>
          </button>

          <button
            className="action-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
