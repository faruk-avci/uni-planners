import './HowToPage.css'

function HowToPage({ language, onNavigate }) {
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  return (
    <main className="howto-page">
      <section className="howto-hero">
        <span className="howto-eyebrow">UniPlanners</span>
        <h1>{tr('Nasıl Kullanılır?', 'How to Use')}</h1>
        <p>{tr('Derslerini seç, uygun programları oluştur ve sana en iyi gelen programı bul.', 'Choose your courses, generate valid schedules, and find the one that works best for you.')}</p>
        <button className="btn btn-primary" type="button" onClick={() => onNavigate('planner')}>
          {tr('Planlayıcıya Git', 'Open Planner')}
        </button>
      </section>

      <section className="howto-steps" aria-label={tr('Kullanım adımları', 'Usage steps')}>
        <article className="howto-step">
          <span className="howto-step-number">1</span>
          <div>
            <h2>{tr('Dersini ara', 'Search for a course')}</h2>
            <p>{tr('Ders kodu veya adıyla arama yap.', 'Search by course code or title.')}</p>
          </div>
        </article>

        <article className="howto-step howto-step-featured">
          <span className="howto-step-number">2</span>
          <div className="howto-step-body">
            <h2>{tr('Dersi veya istediğin şubeyi ekle', 'Add the course or a specific section')}</h2>
            <p>{tr('İki farklı ekleme şekli var. Belirli şubeleri seçmek istiyorsan “Şubeleri Göster” düğmesi tam burada:', 'There are two ways to add a course. To choose specific sections, use the “Show Sections” button right here:')}</p>

            <div className="howto-course-demo" aria-label={tr('Şube ekleme örneği', 'Section selection example')}>
              <div className="howto-demo-course">
                <div>
                  <strong>ENG 101</strong>
                  <span>{tr('İngilizce I', 'English I')}</span>
                </div>
                <div className="howto-demo-actions">
                  <span className="howto-demo-button">{tr('Tümünü Ekle', 'Add All')}</span>
                  <span className="howto-show-sections-callout">
                    <span className="howto-demo-button howto-demo-button-focus">
                      {tr('Şubeleri Göster', 'Show Sections')} <b>3</b>⌄
                    </span>
                    <span className="howto-demo-pointer">↑ <strong>{tr('Şubeleri görmek için buraya bas', 'Press here to see the sections')}</strong></span>
                  </span>
                </div>
              </div>
              <div className="howto-demo-sections">
                <div><span><strong>ENG 101A</strong><small>Pzt · 10:40–12:30</small></span><b>{tr('Ekle', 'Add')}</b></div>
                <div><span><strong>ENG 101B</strong><small>Sal · 14:40–16:30</small></span><b>{tr('Ekle', 'Add')}</b></div>
              </div>
            </div>

            <div className="howto-choice-grid">
              <div><strong>{tr('Tümünü Ekle', 'Add All')}</strong><span>{tr('Sadece o dersin tüm şubeleri eklenir.', 'Only all sections of that course are added.')}</span></div>
              <div><strong>{tr('Şubeleri Göster → Ekle', 'Show Sections → Add')}</strong><span>{tr('Yalnızca seçtiğin şubeler programa dahil edilir.', 'Only your selected sections are included.')}</span></div>
              <div><strong>{tr('Grup Olarak Ekle', 'Add as Group')}</strong><span>{tr('Aynı saatli şubeleri alternatif olarak birlikte ekler.', 'Adds same-time sections together as alternatives.')}</span></div>
            </div>
          </div>
        </article>

        <article className="howto-step">
          <span className="howto-step-number">3</span>
          <div>
            <h2>{tr('Sepetini kontrol et', 'Review your basket')}</h2>
            <p>{tr('Dersleri, seçtiğin şubeleri ve toplam AKTS’yi kontrol et. Telefonda alttaki “Sepetim” çubuğuna bas.', 'Review courses, selected sections, and total ECTS. On mobile, press the “My Basket” bar at the bottom.')}</p>
          </div>
        </article>

        <article className="howto-step">
          <span className="howto-step-number">4</span>
          <div>
            <h2>{tr('Program oluştur', 'Generate schedules')}</h2>
            <p>{tr('Boş gün tercihlerini belirle ve “Program Oluştur”a bas. Uygun programlar arasında ileri–geri gezebilirsin.', 'Choose preferred free days and press “Generate Schedules.” Browse between the valid results.')}</p>
          </div>
        </article>

        <article className="howto-step">
          <span className="howto-step-number">5</span>
          <div>
            <h2>{tr('Programını tamamla', 'Complete your schedule')}</h2>
            <p>{tr('“Programıma Uyan Dersleri Göster” ile boş saatlerine uyan bölüm derslerini incele. Müfredat sayfasından açık dersleri de doğrudan ekleyebilirsin.', 'Use “Show Courses That Fit” to explore major courses fitting your free slots. You can also add open courses directly from Curriculum.')}</p>
            <div className="howto-fitting-demo">
              <div className="howto-fitting-trigger">{tr('Programıma Uyan Dersleri Göster', 'Show Courses That Fit This Schedule')} <b>{tr('Yeni', 'New')}</b></div>
              <div className="howto-fitting-major">
                <span>{tr('Bölüm:', 'Major:')} <strong>{tr('Otel Yöneticiliği', 'Hotel Management')} (BSHMAN / BSHOTM)</strong></span>
                <b>{tr('Değiştir', 'Change')}</b>
              </div>
              <div className="howto-fitting-warning">
                {tr(
                  'Bu dersler programınıza saat olarak uyuyor. Bazılarını daha önce almış olabilir veya ön koşullarını sağlamıyor olabilirsiniz — lütfen kontrol edin.',
                  'These courses fit your schedule time-wise. You may have already taken some, or may not meet the prerequisites — please verify.'
                )}
              </div>
              <div className="howto-fitting-filters">
                <span>{tr('Filtre:', 'Filter:')}</span>
                <div>
                  <b>{tr('Zorunlu', 'Required')}</b>
                  <b>{tr('Serbest seçmeli', 'Free elective')}</b>
                  <b>{tr('Dil seçmeli', 'Language elective')}</b>
                  <b>{tr('Sosyal seçmeli (kısıtlı)', 'Social elective (restricted)')}</b>
                </div>
              </div>
              <div className="howto-fitting-group">
                <strong>{tr('Zorunlu Dersler', 'Required Courses')} <b>28</b></strong>
                <span>⌄</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="howto-footer-cta">
        <h2>{tr('Hazırsan başlayalım.', 'Ready when you are.')}</h2>
        <div>
          <button className="btn btn-primary" type="button" onClick={() => onNavigate('planner')}>{tr('Planlayıcı', 'Planner')}</button>
          <button className="btn btn-secondary" type="button" onClick={() => onNavigate('curriculum')}>{tr('Müfredat', 'Curriculum')}</button>
        </div>
      </section>
    </main>
  )
}

export default HowToPage
