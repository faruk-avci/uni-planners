import { useState } from 'react'
import { courseService } from '../../services/courseService'
import { trackEvent } from '../../utils/analytics'
import './BasketPanel.css'

function BasketPanel({ basket, setBasket, removeSection, totalCredits, language, savedBaskets, setSavedBaskets }) {
  const [saveFormOpen, setSaveFormOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  const t = {
    title: language === 'tr' ? 'Sepetim' : 'My Basket',
    credits: language === 'tr' ? 'AKTS' : 'ECTS',
    empty: language === 'tr' ? 'Sepetiniz boş. Ders arayarak ekleyin.' : 'Your basket is empty. Search to add courses.',
    clear: language === 'tr' ? 'Sepeti Temizle' : 'Clear Basket',
    remove: language === 'tr' ? 'Kaldır' : 'Remove',
    courses: language === 'tr' ? 'Eklenen Dersler' : 'Added Courses',
    sections: language === 'tr' ? 'Eklenen Şubeler' : 'Added Sections',
    saveBasket: language === 'tr' ? 'Sepeti Kaydet' : 'Save Basket',
    save: language === 'tr' ? 'Kaydet' : 'Save',
    cancel: language === 'tr' ? 'Vazgeç' : 'Cancel',
    savePlaceholder: language === 'tr' ? 'Sepet adı' : 'Basket name',
    savedBaskets: language === 'tr' ? 'Kayıtlı Sepetler' : 'Saved Baskets',
    load: language === 'tr' ? 'Yükle' : 'Load',
    saved: language === 'tr' ? 'Sepet kaydedildi.' : 'Basket saved.',
    loaded: language === 'tr' ? 'Kayıtlı sepet yüklendi.' : 'Saved basket loaded.',
    deleted: language === 'tr' ? 'Kayıtlı sepet silindi.' : 'Saved basket deleted.',
    saveError: language === 'tr' ? 'Sepet işlemi tamamlanamadı.' : 'Basket operation failed.',
    deleteConfirm: language === 'tr' ? 'Bu kayıtlı sepet silinsin mi?' : 'Delete this saved basket?',
    courseCount: language === 'tr' ? 'ders' : 'courses',
    creditWarning: language === 'tr'
      ? '36 AKTS veya üzeri ders yükü almaya uygun olduğunuzdan emin olun.'
      : 'Make sure you are eligible to take 36 ECTS or more.',
    creditDanger: language === 'tr'
      ? '42 AKTS üzeri ders yükü seçtiniz. Bu ders yükünü almaya uygun olduğunuzdan emin olun.'
      : 'You selected more than 42 ECTS. Make sure you are eligible for this course load.',
  }

  const handleSaveBasket = async event => {
    event.preventDefault()
    const name = saveName.trim()
    if (!name || basket.length === 0 || saveBusy) return
    setSaveBusy(true)
    setSaveStatus(null)
    try {
      const saved = await courseService.saveNamedBasket(name, basket)
      setSavedBaskets(current => [saved, ...current])
      setSaveName('')
      setSaveFormOpen(false)
      setSaveStatus({ type: 'success', text: t.saved })
      trackEvent('basket', 'save', name, { itemCount: basket.length })
    } catch {
      setSaveStatus({ type: 'error', text: t.saveError })
    } finally {
      setSaveBusy(false)
    }
  }

  const loadSavedBasket = saved => {
    setBasket(saved.items.map(item => ({ ...item, sections: [...(item.sections || [])] })))
    setSaveStatus({ type: 'success', text: t.loaded })
    trackEvent('basket', 'load', saved.name, { itemCount: saved.items.length })
  }

  const deleteSavedBasket = async saved => {
    if (!window.confirm(t.deleteConfirm)) return
    try {
      await courseService.deleteSavedBasket(saved.id)
      setSavedBaskets(current => current.filter(item => item.id !== saved.id))
      setSaveStatus({ type: 'success', text: t.deleted })
      trackEvent('basket', 'delete_saved', saved.name)
    } catch {
      setSaveStatus({ type: 'error', text: t.saveError })
    }
  }

  const removeCourse = (code) => {
    setBasket(prev => prev.filter(c => c.code !== code))
    trackEvent('course', 'remove', code, { source: 'basket' })
  }

  const clearBasket = () => {
    trackEvent('basket', 'clear', null, { itemCount: basket.length })
    setBasket([])
  }

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

      {totalCredits > 36 && (
        <div className={`basket-credit-warning ${totalCredits > 42 ? 'basket-credit-danger' : ''}`} role="status">
          <span className="basket-credit-warning-icon" aria-hidden="true">i</span>
          <span>{totalCredits > 42 ? t.creditDanger : t.creditWarning}</span>
        </div>
      )}

      <div className="basket-scroll-content">
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

          </>
        )}

        {saveStatus && (
          <p className={`basket-save-status basket-save-status-${saveStatus.type}`} role="status">{saveStatus.text}</p>
        )}

        {savedBaskets.length > 0 && (
          <div className="saved-baskets">
            <h4 className="saved-baskets-title">{t.savedBaskets}</h4>
            <div className="saved-baskets-list">
              {savedBaskets.map(saved => (
                <div key={saved.id} className="saved-basket-item">
                  <button className="saved-basket-load" type="button" onClick={() => loadSavedBasket(saved)} title={t.load}>
                    <span className="saved-basket-info">
                      <span className="saved-basket-name">{saved.name}</span>
                      <span className="saved-basket-count">{saved.items.length} {t.courseCount}</span>
                    </span>
                    <span className="saved-basket-load-label">{t.load}</span>
                  </button>
                  <button
                    className="saved-basket-delete"
                    type="button"
                    onClick={() => deleteSavedBasket(saved)}
                    title={language === 'tr' ? 'Sil' : 'Delete'}
                    aria-label={`${saved.name} ${language === 'tr' ? 'sepetini sil' : 'delete basket'}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {basket.length > 0 && (
        <div className="basket-fixed-actions-area">
          {saveFormOpen && (
            <form className="basket-save-form" onSubmit={handleSaveBasket}>
              <input
                className="basket-save-input"
                value={saveName}
                onChange={event => setSaveName(event.target.value)}
                placeholder={t.savePlaceholder}
                maxLength={60}
                autoFocus
              />
              <button className="btn btn-sm btn-primary" type="submit" disabled={!saveName.trim() || saveBusy}>
                {saveBusy ? '…' : t.save}
              </button>
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => setSaveFormOpen(false)}>
                {t.cancel}
              </button>
            </form>
          )}
          <div className="basket-actions">
            <button className="btn btn-sm btn-ghost basket-save-trigger" onClick={() => setSaveFormOpen(open => !open)}>
              {t.saveBasket}
            </button>
            <button className="btn btn-sm btn-danger-ghost basket-clear-btn" onClick={clearBasket}>
              {t.clear}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BasketPanel
