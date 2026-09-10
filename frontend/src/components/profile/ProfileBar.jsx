import './ProfileBar.css'

function ProfileBar({ language, majorLabel, grade, onMajorClick, onGradeChange, announcementUrl, surveyUrl }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  return (
    <>
    <section className="profile-bar" aria-label={tr('Akademik profil', 'Academic profile')}>
      <div className="profile-university">
        <span className="profile-university-mark" aria-hidden="true">Ö</span>
        <span>
          <small>{tr('Üniversite', 'University')}</small>
          <strong>{tr('Özyeğin Üniversitesi', 'Özyeğin University')}</strong>
        </span>
      </div>

      <div className="profile-fields">
        <button className="profile-field profile-major-field" type="button" onClick={onMajorClick}>
          <span>
            <small>{tr('Bölümünüz', 'Your major')}</small>
            <strong>{majorLabel || tr('Bölümünüzü seçin', 'Select your major')}</strong>
          </span>
          <span className="profile-field-arrow" aria-hidden="true">›</span>
        </button>

        <label className="profile-field profile-grade-field">
          <span>
            <small>{tr('Sınıfınız', 'Your year')}</small>
            <select value={grade} onChange={event => onGradeChange(event.target.value)}>
              <option value="">{tr('İsteğe bağlı', 'Optional')}</option>
              <option value="prep">{tr('Hazırlık', 'Preparatory')}</option>
              <option value="1">{tr('1. sınıf', 'Year 1')}</option>
              <option value="2">{tr('2. sınıf', 'Year 2')}</option>
              <option value="3">{tr('3. sınıf', 'Year 3')}</option>
              <option value="4">{tr('4. sınıf', 'Year 4')}</option>
            </select>
          </span>
          <span className="profile-select-arrow" aria-hidden="true">⌄</span>
        </label>
      </div>
    </section>
    {(announcementUrl || surveyUrl) && (
      <div className="profile-links">
        {announcementUrl && (
          <a href={announcementUrl} target="_blank" rel="noopener noreferrer" className="profile-link profile-link-announcement">
            <span aria-hidden="true">📢</span>
            <span>
              {language === 'tr' ? (
                <>Bu site resmi ders kayıt sitesi değildir — resmi duyurular ve ders kaydı için <span className="profile-link-emphasis">tıklayın <span aria-hidden="true">🔗</span></span></>
              ) : (
                <>This is not the official course registration site — <span className="profile-link-emphasis">click here <span aria-hidden="true">🔗</span></span> for official announcements and registration</>
              )}
            </span>
          </a>
        )}
        {surveyUrl && (
          <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="profile-link profile-link-survey">
            <span>{tr('Lütfen anketi doldurmayı unutmayın', 'Please don’t forget to fill out our survey')} <strong>{tr('→ Ankete git', '→ Go to survey')}</strong></span>
          </a>
        )}
      </div>
    )}
    </>
  )
}

export default ProfileBar
