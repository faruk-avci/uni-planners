import { go, request, formatDay } from '../api.js'
import { PageHeader, RoleBadge, useLoad } from '../ui.jsx'

function Fact({ label, value, hint, onClick, tone = '' }) {
  return (
    <button type="button" className={`fact ${tone}`} onClick={onClick}>
      <span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}
    </button>
  )
}

export default function Overview({ user }) {
  const { data, error, loading } = useLoad(() => request('/overview'), [])
  const greeting = user.displayName ? `Merhaba ${user.displayName}` : 'Genel bakış'

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={user.isSuperadmin ? 'Tüm üniversitelerin durumu. Ayrıntı için bir karta tıklayın.' : 'Yetkili olduğunuz üniversitelerin durumu.'}
      />
      {error && <div className="alert alert-error">{error}</div>}
      {loading && !data && <p className="empty-note">Yükleniyor…</p>}
      <div className="university-cards">
        {data?.universities.map(university => {
          const base = `/u/${university.slug}`
          const notice = university.settings.catalogNotice
          return (
            <article className="university-card" key={university.slug}>
              <header>
                <div><h2>{university.name}</h2><p className="muted">{university.settings.catalogTerm}{university.settings.updatedAt ? ` · ayarlar ${formatDay(university.settings.updatedAt)}` : ''}</p></div>
                {!user.isSuperadmin && <RoleBadge role={university.role} />}
              </header>
              <div className="fact-grid">
                <Fact
                  label="Duyuru"
                  value={notice ? 'Yayında' : 'Yok'}
                  hint={notice ? `“${notice.slice(0, 60)}${notice.length > 60 ? '…' : ''}”` : 'Katalog bildirimi kapalı'}
                  tone={notice ? 'fact-on' : ''}
                  onClick={() => go(`${base}/settings`)}
                />
                <Fact
                  label="Anket"
                  value={university.survey.active ? `Açık · v${university.survey.version}` : 'Kapalı'}
                  hint={university.settings.hasSurveyLink ? 'Sitede bağlantı görünüyor' : 'Sitede bağlantı yok'}
                  tone={university.survey.active ? 'fact-on' : 'fact-off'}
                  onClick={() => go(`${base}/survey`)}
                />
                <Fact
                  label="Cevaplar"
                  value={university.survey.responses}
                  hint={`Bu sürümde ${university.survey.currentVersionResponses}${university.survey.lastResponse ? ` · son ${formatDay(university.survey.lastResponse)}` : ''}`}
                  onClick={() => go(`${base}/results`)}
                />
                <Fact
                  label="Müfredat"
                  value={university.curriculumSource === 'static' ? `${university.curricula.listed} / ${university.curricula.total}` : university.curricula.total}
                  hint={university.curriculumSource === 'static' ? 'sitede listelenen / katalogdaki' : 'yayındaki program'}
                  onClick={() => go(`${base}/curricula`)}
                />
              </div>
            </article>
          )
        })}
      </div>
      {data && data.universities.length === 0 && <p className="empty-note">Henüz hiçbir üniversite için yetkiniz yok. Süper yöneticiden yetki isteyin.</p>}
    </>
  )
}
