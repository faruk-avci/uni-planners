import { useEffect, useState } from 'react'
import { go, request } from './api.js'
import { Login, Setup } from './auth.jsx'
import { Icon, RoleBadge } from './ui.jsx'
import Overview from './pages/Overview.jsx'
import UniversitySettings from './pages/UniversitySettings.jsx'
import SurveyEditor from './pages/SurveyEditor.jsx'
import SurveyResults from './pages/SurveyResults.jsx'
import Curricula from './pages/Curricula.jsx'
import { UniversityAnalytics, Traffic } from './pages/Analytics.jsx'
import Users from './pages/Users.jsx'
import GlobalSettings from './pages/GlobalSettings.jsx'
import Audit from './pages/Audit.jsx'
import Account from './pages/Account.jsx'

const parseHash = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

function useHashRoute() {
  const [parts, setParts] = useState(parseHash)
  useEffect(() => {
    const update = () => { setParts(parseHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return parts
}

const UNIVERSITY_PAGES = [
  { id: 'settings', label: 'Site ayarları', icon: 'settings' },
  { id: 'survey', label: 'Anket', icon: 'survey' },
  { id: 'results', label: 'Anket sonuçları', icon: 'results' },
  { id: 'curricula', label: 'Müfredatlar', icon: 'curricula' },
  { id: 'analytics', label: 'Analitik', icon: 'analytics', only: 'ozyegin' },
  { id: 'activity', label: 'Etkinlik kaydı', icon: 'activity' },
]
const ADMIN_PAGES = [
  { id: 'users', label: 'Kullanıcılar ve yetkiler', icon: 'users' },
  { id: 'settings', label: 'Genel ayarlar', icon: 'globe' },
  { id: 'audit', label: 'Denetim kaydı', icon: 'shield' },
  { id: 'traffic', label: 'Site trafiği', icon: 'traffic' },
]

function NoAccess() {
  return <div className="content-card empty-state"><h2>Bu sayfaya erişiminiz yok</h2><p className="muted">Yetki gerekiyorsa süper yöneticiden isteyin.</p><button className="secondary-button" onClick={() => go('/')}>Genel bakışa dön</button></div>
}

function Shell({ session, route, onSignOut }) {
  const { user, universities } = session
  const role = slug => (user.isSuperadmin ? 'editor' : user.access[slug] || null)
  const mine = universities.filter(university => role(university.slug))
  const [section, slug, page] = route

  // On phones the navigation is one scrolling row: keep the current page in view.
  useEffect(() => {
    document.querySelector('.side-nav nav .nav-active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [section, slug, page])
  const navButton = (path, label, icon, active) => (
    <button key={path} className={active ? 'nav-active' : ''} onClick={() => go(path)} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} />{label}
    </button>
  )

  let content
  if (!section || section === 'overview') content = <Overview user={user} />
  else if (section === 'u') {
    const university = universities.find(item => item.slug === slug)
    const pageDef = UNIVERSITY_PAGES.find(item => item.id === page)
    if (!university || !role(slug) || !pageDef || (pageDef.only && pageDef.only !== slug)) content = <NoAccess />
    else {
      const props = { university, role: role(slug), user }
      content = {
        settings: <UniversitySettings {...props} />,
        survey: <SurveyEditor {...props} />,
        results: <SurveyResults {...props} />,
        curricula: <Curricula {...props} />,
        analytics: <UniversityAnalytics {...props} />,
        activity: <Audit university={university} />,
      }[page]
    }
  } else if (section === 'admin') {
    if (!user.isSuperadmin) content = <NoAccess />
    else content = { users: <Users me={user} />, settings: <GlobalSettings />, audit: <Audit universities={universities} />, traffic: <Traffic /> }[slug] || <NoAccess />
  } else if (section === 'account') content = <Account user={user} />
  else content = <NoAccess />

  return (
    <div className="panel-shell">
      <aside className="side-nav">
        <a className="panel-brand" href="#/"><span>U</span><strong>UniPlanners</strong><small>Yönetim paneli</small></a>
        <nav aria-label="Panel">
          {navButton('/', 'Genel bakış', 'overview', !section || section === 'overview')}
          {mine.map(university => (
            <div className="nav-group" key={university.slug}>
              <div className="nav-group-title"><span>{university.shortName}</span>{!user.isSuperadmin && <RoleBadge role={role(university.slug)} />}</div>
              {UNIVERSITY_PAGES.filter(item => !item.only || item.only === university.slug).map(item =>
                navButton(`/u/${university.slug}/${item.id}`, item.label, item.icon, section === 'u' && slug === university.slug && page === item.id))}
            </div>
          ))}
          {user.isSuperadmin && (
            <div className="nav-group">
              <div className="nav-group-title"><span>Yönetim</span><RoleBadge role="superadmin" /></div>
              {ADMIN_PAGES.map(item => navButton(`/admin/${item.id}`, item.label, item.icon, section === 'admin' && slug === item.id))}
            </div>
          )}
        </nav>
        <div className="side-footer">
          <button className={section === 'account' ? 'side-account nav-active' : 'side-account'} onClick={() => go('/account')} title="Hesabım">
            <Icon name="account" size={15} /><span><strong>{user.displayName || user.email.split('@')[0]}</strong><small>{user.email}</small></span>
          </button>
          <a href="https://uniplanners.org" target="_blank" rel="noopener noreferrer">Siteye git</a>
          <button onClick={onSignOut}>Çıkış yap</button>
        </div>
      </aside>
      <main className="panel-main">{content}</main>
    </div>
  )
}

// Replaces the current history entry, so a used setup token does not stay in
// the address bar or the back button. Unlike history.replaceState this fires
// hashchange, which the router listens to.
const leaveTo = path => window.location.replace(`${window.location.pathname}${window.location.search}#${path}`)

export default function App() {
  const [session, setSession] = useState({ state: 'checking' })
  const route = useHashRoute()

  useEffect(() => {
    request('/me').then(data => setSession({ state: 'in', ...data })).catch(() => setSession({ state: 'out' }))
    const signedOut = () => setSession({ state: 'out', message: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.' })
    window.addEventListener('panel:signed-out', signedOut)
    return () => window.removeEventListener('panel:signed-out', signedOut)
  }, [])

  const signedIn = data => {
    setSession({ state: 'in', user: data.user, universities: data.universities })
    leaveTo('/')
  }
  const signOut = async () => {
    await request('/logout', { method: 'POST' }).catch(() => {})
    setSession({ state: 'out' })
    go('/')
  }

  if (session.state === 'checking') return <div className="loading-screen"><span className="brand-mark">U</span><p>Panel hazırlanıyor…</p></div>
  if (route[0] === 'setup' && route[1] && session.state !== 'in') {
    return <Setup token={route[1]} onSignedIn={signedIn} onCancel={() => leaveTo('/')} />
  }
  if (session.state !== 'in') return <Login onSignedIn={signedIn} initialMessage={session.message} />
  return <Shell session={session} route={route} onSignOut={signOut} />
}
