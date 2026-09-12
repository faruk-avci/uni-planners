import { useEffect, useState } from 'react'
import { COURSE_COLORS } from '../../utils/courseColors'
import { workloadImagePng } from '../../utils/workloadImageSvg'
import './CourseWorkload.css'

function CourseWorkload({ basket, language, showHeader = true }) {
  const [exporting, setExporting] = useState(false)
  // Translate labels
  const t = {
    course: language === 'tr' ? 'Ders' : 'Course',
    final: language === 'tr' ? 'Final' : 'Final',
    midterm: language === 'tr' ? 'Vize' : 'Midterm',
    quiz: language === 'tr' ? 'Quiz' : 'Quiz',
    homework: language === 'tr' ? 'Ödev' : 'Homework',
    project: language === 'tr' ? 'Proje' : 'Project',
    lab: language === 'tr' ? 'Lab' : 'Lab',
    attendance: language === 'tr' ? 'Katılım' : 'Attendance',
    other: language === 'tr' ? 'Diğer' : 'Other',
    total: language === 'tr' ? 'Toplam' : 'Total',
    breakdown: language === 'tr' ? 'Değerlendirmeler' : 'Assessments',
    noData: language === 'tr'
      ? 'Syllabus henüz yayınlanmadı — daha sonra tekrar kontrol edin.'
      : 'Syllabus not published yet — check back later.',
    sectionTitle: language === 'tr' ? 'Ders Yükü Tablosu' : 'Course Workload Table',
    newBadge: language === 'tr' ? 'Yeni' : 'New',
    infoText: language === 'tr'
      ? 'Derslerinizin final, vize ve diğer değerlendirme ağırlıklarını tek tabloda görebilirsiniz. Syllabuslar yayınlandıkça burada görünmeye başlayacak.'
      : 'See the final, midterm, and other grading weights for your courses in one table. They will appear here as syllabi are published.',
    exportImage: language === 'tr' ? 'Görsel Olarak İndir' : 'Download PNG',
    exporting: language === 'tr' ? 'Görsel hazırlanıyor…' : 'Creating image…',
  }

  const hasAnyData = (basket || []).some(course => course.assessments && course.assessments.length > 0)

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await workloadImagePng(basket, language)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'uniplanners-ders-yuku.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Workload image export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  // Categories to sum
  const categories = ['final', 'midterm', 'quiz', 'homework', 'project', 'lab', 'attendance', 'other']

  const getWorkloadItems = (assessments, category) => {
    if (!assessments || assessments.length === 0) return []
    return assessments.filter(a => {
      const matchCategory = category === 'other'
        ? ['other', 'presentation', 'report'].includes(a.category)
        : a.category === category;
      return matchCategory && a.weight !== null && a.weight !== undefined;
    })
  }

  return (
    <div className={showHeader ? 'workload-block' : ''}>
      {showHeader && (
        <>
          <div className="workload-header">
            <div className="workload-header-title">
              <h3>{t.sectionTitle}</h3>
              <span className="badge badge-new">{t.newBadge}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={!hasAnyData || exporting}>
              {exporting ? t.exporting : t.exportImage}
            </button>
          </div>
          <div className="workload-info-box">{t.infoText}</div>
        </>
      )}
      <div className="workload-table-wrapper animate-fade-in">
      <table className="workload-table">
        <thead>
          <tr>
            <th className="workload-th-course">{t.course}</th>
            <th className="workload-th-breakdown">{t.breakdown}</th>
            <th className="workload-th-total">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {basket.map(course => {
            const hasAssessments = course.assessments && course.assessments.length > 0;
            // A syllabus that only yielded unreliable/unreviewed rows (weight
            // left null on purpose, e.g. "Please check syllabus") shouldn't
            // render as a broken all-dashes %0 row -- show its note instead.
            const reviewNote = hasAssessments && course.assessments.every(a => a.weight === null || a.weight === undefined)
              ? course.assessments.map(a => a.type).filter(Boolean).join('; ')
              : null;
            const totalWeight = hasAssessments
              ? course.assessments.reduce((sum, a) => sum + (a.weight || 0), 0)
              : 0;

            return (
              <tr key={course.code} className="workload-row">
                <td className="workload-td-course">
                  <div className="workload-course-info">
                    <span className="workload-course-code">{course.code}</span>
                    <span className="workload-course-name">{course.name}</span>
                  </div>
                </td>
                
                {reviewNote ? (
                  <td colSpan="2" className="workload-no-data">
                    <em>{reviewNote}</em>
                  </td>
                ) : hasAssessments ? (
                  <>
                    <td className="workload-td-breakdown">
                      <div className="workload-item-list">
                        {categories.flatMap(cat => getWorkloadItems(course.assessments, cat)).map((item, index) => (
                          <div
                            key={`${item.category}-${index}`}
                            className="workload-item-row"
                            style={{ '--item-color': COURSE_COLORS[index % COURSE_COLORS.length] }}
                          >
                            <span className="workload-item-type" title={item.type}>{item.type}</span>
                            <span className="workload-item-weight">%{item.weight}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="workload-td-total">
                      <span className={`total-badge ${totalWeight === 100 ? 'total-complete' : 'total-incomplete'}`}>
                        %{totalWeight}
                      </span>
                    </td>
                  </>
                ) : (
                  <td colSpan="2" className="workload-no-data">
                    <em>{t.noData}</em>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export default CourseWorkload
