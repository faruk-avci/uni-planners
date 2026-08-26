import { useRef, useState } from 'react'
import { courseService } from '../../services/courseService'
import './DegreeAuditUpload.css'

function DegreeAuditUpload({ language, result, onResult, onClose }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const tr = (a, b) => (language === 'tr' ? a : b)

  const handleFile = async file => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const parsed = await courseService.parseDegreeAudit(buffer, file.name)
      onResult(parsed)
    } catch (err) {
      setError(err.message || tr('PDF ayrıştırılamadı.', 'The PDF could not be parsed.'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleClear = () => {
    onResult(null)
  }

  return (
    <div className="audit-upload-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="audit-upload-panel" role="dialog" aria-modal="true" aria-labelledby="audit-upload-title">
        <header className="audit-upload-header">
          <div>
            <span className="audit-upload-eyebrow">{tr('Gizli özellik', 'Hidden feature')}</span>
            <h2 id="audit-upload-title">{tr('Mezuniyet Denetim Raporu', 'Degree Audit Report')}</h2>
            <p>{tr(
              'PDF yalnızca sunucuda geçici olarak işlenir; hiçbir yerde saklanmaz. Sonuç sadece bu tarayıcıda tutulur.',
              'The PDF is only processed transiently on the server and never stored. The result is kept only in this browser.'
            )}</p>
          </div>
          <button className="audit-upload-close" type="button" onClick={onClose} aria-label={tr('Kapat', 'Close')}>×</button>
        </header>

        <div className="audit-upload-body">
          <button
            type="button"
            className="audit-upload-picker"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <span className="audit-upload-icon">↑</span>
            <span>
              <strong>{busy ? tr('Yükleniyor…', 'Uploading…') : tr('PDF seç', 'Choose PDF')}</strong>
              <small>{tr('Mezuniyet denetim raporunu yükleyin (.pdf)', 'Upload your degree audit report (.pdf)')}</small>
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={event => handleFile(event.target.files?.[0])}
            />
          </button>

          {error && <div className="audit-upload-error">{error}</div>}

          {result && (
            <div className="audit-upload-summary">
              <div>
                <strong>{result.major}</strong>
                <span>{tr('için sonuç yüklendi', 'result loaded')}</span>
              </div>
              <ul>
                <li>{tr('Tamamlanan zorunlu ders', 'Required courses taken')}: {result.requiredTaken?.length ?? 0}</li>
                <li>{tr('Eksik zorunlu ders', 'Required courses missing')}: {result.requiredMissing?.length ?? 0}</li>
                <li>{tr('Yerleştirilemeyen kredi', 'Unplaced credits')}: {(result.unplaced || []).reduce((sum, item) => sum + (item.credits || 0), 0)}</li>
              </ul>
              <p className="audit-upload-hint">
                {tr('Detaylar Müfredat sayfasında gösterilir.', 'Details are shown on the Curriculum page.')}
              </p>
              <button type="button" className="audit-upload-clear" onClick={handleClear}>
                {tr('Sonucu temizle', 'Clear result')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default DegreeAuditUpload
