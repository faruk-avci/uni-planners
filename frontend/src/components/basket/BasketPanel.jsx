import './BasketPanel.css'

function BasketPanel({ basket, setBasket, removeSection, totalCredits, language }) {
  const t = {
    title: language === 'tr' ? 'Sepetim' : 'My Basket',
    credits: language === 'tr' ? 'AKTS' : 'ECTS',
    empty: language === 'tr' ? 'Sepetiniz boş. Ders arayarak ekleyin.' : 'Your basket is empty. Search to add courses.',
    clear: language === 'tr' ? 'Sepeti Temizle' : 'Clear Basket',
    remove: language === 'tr' ? 'Kaldır' : 'Remove',
    courses: language === 'tr' ? 'Eklenen Dersler' : 'Added Courses',
    sections: language === 'tr' ? 'Eklenen Şubeler' : 'Added Sections',
  }

  const removeCourse = (code) => setBasket(prev => prev.filter(c => c.code !== code))

  // Whole-course items vs. section-pinned items (flattened to one row per section).
  const wholeCourses = basket.filter(c => !c.sections || c.sections.length === 0)
  const sectionRows = basket.flatMap(c =>
    (c.sections || []).map(sec => ({ code: c.code, name: c.name, section: sec }))
  )

  return (
    <div className="basket-panel">
      <div className="basket-header">
        <h3 className="basket-title">
          {t.title}
          {basket.length > 0 && <span className="basket-count">{basket.length}</span>}
        </h3>
        <div className="basket-credits">
          <span className="credits-value">{totalCredits}</span>
          <span className="credits-label">{t.credits}</span>
        </div>
      </div>

      {basket.length === 0 ? (
        <p className="basket-empty">{t.empty}</p>
      ) : (
        <>
          {/* Added whole courses */}
          {wholeCourses.length > 0 && (
            <div className="basket-group">
              <h4 className="basket-group-title">{t.courses}</h4>
              <div className="basket-items">
                {wholeCourses.map(course => (
                  <div key={course.code} className="basket-item">
                    <div className="basket-item-info">
                      <div className="basket-item-code-row">
                        <span className="basket-item-code">{course.code}</span>
                        <span className="basket-item-credits">{course.credits} {t.credits}</span>
                      </div>
                      <span className="basket-item-name">{course.name}</span>
                    </div>
                    <button className="basket-remove-btn" onClick={() => removeCourse(course.code)} title={t.remove}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Added specific sections */}
          {sectionRows.length > 0 && (
            <div className="basket-group">
              <h4 className="basket-group-title">{t.sections}</h4>
              <div className="basket-items">
                {sectionRows.map(row => (
                  <div key={`${row.code}-${row.section}`} className="basket-item">
                    <div className="basket-item-info">
                      <span className="basket-item-code">{row.section}</span>
                      <span className="basket-item-name">{row.name}</span>
                    </div>
                    <button className="basket-remove-btn" onClick={() => removeSection(row.code, row.section)} title={t.remove}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="basket-actions">
            <button className="btn btn-sm btn-danger-ghost basket-clear-btn" onClick={() => setBasket([])}>
              {t.clear}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default BasketPanel
