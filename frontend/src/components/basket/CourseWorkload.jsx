import { useEffect } from 'react'
import './CourseWorkload.css'

function CourseWorkload({ basket, language }) {
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
    noData: language === 'tr' ? 'Syllabus verisi yok' : 'No syllabus data',
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
    <div className="workload-table-wrapper animate-fade-in">
      <table className="workload-table">
        <thead>
          <tr>
            <th className="workload-th-course">{t.course}</th>
            <th>{t.final}</th>
            <th>{t.midterm}</th>
            <th>{t.quiz}</th>
            <th>{t.homework}</th>
            <th>{t.project}</th>
            <th>{t.lab}</th>
            <th>{t.attendance}</th>
            <th>{t.other}</th>
            <th className="workload-th-total">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {basket.map(course => {
            const hasAssessments = course.assessments && course.assessments.length > 0;
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
                
                {hasAssessments ? (
                  <>
                    {categories.map(cat => {
                      const items = getWorkloadItems(course.assessments, cat);
                      const hasItems = items.length > 0;

                      if (!hasItems) {
                        return <td key={cat} className="zero-weight">-</td>;
                      }

                      const weightStr = items.map(item => `%${item.weight}`).join(' + ');
                      const typesStr = items.map(item => item.type).join(' + ');

                      return (
                        <td key={cat} className="has-weight">
                          <div className="workload-cell-details">
                            <span className="workload-cell-weight">{weightStr}</span>
                            <span className="workload-cell-types" title={typesStr}>{typesStr}</span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="workload-td-total">
                      <span className={`total-badge ${totalWeight === 100 ? 'total-complete' : 'total-incomplete'}`}>
                        %{totalWeight}
                      </span>
                    </td>
                  </>
                ) : (
                  <td colSpan="9" className="workload-no-data">
                    <em>{t.noData}</em>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default CourseWorkload
