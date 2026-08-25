import './ProfileBar.css'

function ProfileBar({ language, majorLabel, grade, onMajorClick, onGradeChange }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  return (
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
  )
}

export default ProfileBar
