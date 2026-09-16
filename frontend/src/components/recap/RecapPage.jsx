import { useEffect, useMemo } from 'react';
import './RecapPage.css';
import chartDataJson from './chart-data.json';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function RecapPage({ language }) {
  useEffect(() => {
    document.title = 'UniPlanners Recap - 2026/2027 Güz Ders Kayıt Dönemi';
  }, []);

  const tr = (a, b) => (language === 'tr' ? a : b);

  const stats = {
    totalSchedules: '29.000+',
    totalFitting: '900+',
    uniqueUsers: '1.600+',
    topMajors: [
      { major: tr('Endüstri Mühendisliği', 'Industrial Engineering'), count: '205' },
      { major: tr('Bilgisayar Mühendisliği', 'Computer Science'), count: '201' },
      { major: tr('Elektrik-Elektronik Mühendisliği', 'Electrical-Electronics Eng.'), count: '140' },
      { major: tr('Uluslararası Ticaret ve İşletmecilik', 'International Business'), count: '107' },
      { major: tr('Hukuk', 'Law'), count: '106' },
      { major: tr('Makina Mühendisliği', 'Mechanical Engineering'), count: '102' },
      { major: tr('İşletme', 'Business Administration'), count: '97' },
      { major: tr('Havacılık Yönetimi', 'Aviation Management'), count: '80' },
      { major: tr('Psikoloji', 'Psychology'), count: '80' },
      { major: tr('Yapay Zeka ve Veri Mühendisliği', 'Artificial Intelligence'), count: '77' },
      { major: tr('Ekonomi', 'Economics'), count: '74' },
      { major: tr('Mimarlık (İngilizce)', 'Architecture (ENG)'), count: '71' },
      { major: tr('Gastronomi ve Mutfak Sanatları', 'Gastronomy and Culinary Arts'), count: '68' },
      { major: tr('Yönetim Bilişim Sistemleri', 'Management Information Systems'), count: '67' },
      { major: tr('İnşaat Mühendisliği', 'Civil Engineering'), count: '65' },
      { major: tr('Endüstriyel Tasarım', 'Industrial Design'), count: '56' },
      { major: tr('Uluslararası Finans', 'International Finance'), count: '53' },
      { major: tr('Pilotaj', 'Professional Flight'), count: '44' }
    ],
    classDistribution: [
      { class: 'Hazırlık', count: '27' },
      { class: '1. Sınıf', count: '384' },
      { class: '2. Sınıf', count: '458' },
      { class: '3. Sınıf', count: '216' },
      { class: '4. Sınıf', count: '146' }
    ],
    extraStats: [
      { label: tr('Sepet Kaydetme', 'Baskets Saved'), count: '565' },
      { label: tr('Programa Uyan Dersleri Bulma', 'Fitting Course Search'), count: '3.851' },
      { label: tr('Program Paylaşma', 'Schedules Shared'), count: '214' }
    ]
  };

  const survey = {
    generalRating: '4.91/5',
    uiRating: '9.64/10',
    recommendation: '9.87/10',
    totalResponses: '53'
  };

  const userComments = [
    "Gerçekten bayıldım. Çok büyük bi yükten kurtardınız bizi. Çok net, sade ve modern bir tasarım. Emeği geçen herkesin eline sağlık. Çok başarılı",
    "Belki de bir üniversite öğrencisinin dönem önceleri en iyi dostu olabilir bu uygulama. Özyeğin Üniversitesi öğrencileri olarak mutlulukla kullanıyoruz ve gurur duyuyoruz bu uygulamanın yapımcılarıyla.",
    "öncelikle uygulamayı 5. yılımda mezuniyetime 1 dönem kalmışken ilk defa kullandığım için çok üzüldüm ilk dönemimden beri olsaydı belki okulu uzatmazdım :D elinize sağlık gerçekten  hep olmasını istediğim bi uygulamaydı ui ux olarak da çok güzel olmuş. geliştirme önerilerimi de ilettim bunlar da olsaydı gerçekten 10000/10 bi uygulama olurdu",
    "Gayet kullanışlı keşke daha önceden bilseydim arkadaş sayesinde fark ettim böyle güzel bir sistemin olduğunu",
    "şuan eksik hiçbir şeyini görmediğim güzel ve işlevsel bir uygulama elinize; emeğinize sağlık",
    "Gerçekten tüm öğrencilerin stres yaptığı işe yarar ve güvenilir bir uygulama. Teşekkürler Faruk.",
    "Rahat ve ders seçimleri için kolaylaştırıcı kullanım sunuyor.",
    "Elinize sağlıktan başka birşey denebileceğini düşünmüyorum.",
    "Gerçekten hayat kurtarıcı bir uygulama",
    "Gayet guzel ve mantikli bir uygulama",
    "Harika uygulama! Elinize, aklınıza sağlık.",
    "Çok güzel olmuş elinize sağlık ",
    "Mükemmel",
    "Çok iyi",
    "ÇOK IYI",
    "mğkemmel daha ne diyelim",
    "fazla harika",
    "Faruk adamsın"
  ];

  const { chartData, totalViews } = useMemo(() => {
    try {
      const series = chartDataJson?.data?.viewer?.accounts?.[0]?.series;
      if (!series) return { chartData: [], totalViews: 0 };
      
      let totalViews = 0;

      const sortedData = [...series]
        .sort((a, b) => a.dimensions.ts.localeCompare(b.dimensions.ts))
        .map(item => {
          const dateObj = new Date(item.dimensions.ts);
          totalViews += item.count;
          return {
            fullDate: dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
            views: item.count
          };
        });
        
      return { chartData: sortedData, totalViews };
    } catch (e) {
      console.error('Error parsing pageview data:', e);
      return { chartData: [], totalViews: 0 };
    }
  }, []);

  return (
    <main className="recap-page">
      <section className="recap-hero">
        <span className="recap-eyebrow">UniPlanners</span>
        <h1>{tr('2026-2027 Güz Ders Kayıt Dönemi Özeti', '2026-2027 Fall Course Registration Recap')}</h1>
        <p>
          {tr(
            'UniPlanners ile bu dönemin öne çıkan verileri.',
            'Highlights of this semester with UniPlanners.'
          )}
        </p>
      </section>

      <section className="recap-steps" aria-label={tr('Özet adımları', 'Recap steps')}>
        
        {/* Step 1: İstatistikler */}
        <article className="recap-step">
          <span className="recap-step-number">1</span>
          <div className="recap-step-body">
            <h2>{tr('İstatistikler', 'Statistics')}</h2>
            <p>{tr('Bu dönem oluşturulan program sayılarına genel bir bakış.', 'An overview of the schedules generated this semester.')}</p>
            
            <div className="recap-stats-grid">
              <div className="recap-stat-card">
                <strong>{stats.totalSchedules}</strong>
                <span>{tr('Oluşturulan Program', 'Schedules Generated')}</span>
              </div>
              <div className="recap-stat-card">
                <strong>{stats.uniqueUsers}</strong>
                <span>{tr('Tekil Kullanıcı', 'Unique Users')}</span>
              </div>
              <div className="recap-stat-card">
                <strong>{stats.totalFitting}</strong>
                <span>{tr('Programına Uyan Diğer Dersleri Arayan', 'Fitting Course Seekers')}</span>
              </div>
            </div>

            {chartData.length > 0 && (
              <div className="recap-chart-container" style={{ marginTop: 'var(--space-6)', height: 320, background: 'var(--bg-tertiary)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-secondary)' }}>
                <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', color: 'var(--text-primary)', borderBottom: '2px solid var(--border-primary)', paddingBottom: 'var(--space-2)', fontWeight: '600' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{tr('Kayıt Haftası Trafiği', 'Registration Week Traffic')}</span>
                    <span style={{ color: 'var(--accent-primary)', fontSize: 'var(--text-sm)', fontWeight: '600' }}>
                      14.500+ {tr('Sayfa Görüntüleme', 'Page Views')}
                    </span>
                  </div>
                </h3>
                <ResponsiveContainer width="100%" height="85%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-secondary)" opacity={0.5} />
                    <XAxis 
                      dataKey="fullDate" 
                      minTickGap={10} 
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', padding: '10px', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                              <p style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontSize: '12px', margin: 0 }}>{label}</p>
                              <p style={{ color: 'var(--accent-primary)', fontWeight: '600', fontSize: '14px', margin: '4px 0 0 0' }}>
                                {tr('Görüntüleme', 'Views')}: {payload[0].value.toLocaleString('tr-TR')}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="views" barSize={2} fill="var(--border-primary)" />
                    <Line 
                      type="monotone" 
                      dataKey="views" 
                      name={tr('Görüntüleme', 'Views')} 
                      stroke="var(--accent-primary)" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: 'var(--bg-tertiary)', stroke: 'var(--accent-primary)', strokeWidth: 2 }} 
                      activeDot={{ r: 6, fill: 'var(--accent-primary)' }} 
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </article>

        {/* Step 2: Öne Çıkanlar */}
        <article className="recap-step recap-step-featured">
          <span className="recap-step-number">2</span>
          <div className="recap-step-body">
            <h2>{tr('Öne Çıkanlar', 'Highlights')}</h2>
            <p>{tr('En çok hangi bölümler sistemi kullandı ve en çok hangi ders sepetlere eklendi?', 'Which majors used the system the most, and which course was added most frequently?')}</p>
            
            <div className="recap-highlights-container" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)' }}>
              <div className="recap-highlight-box">
                <h3>{tr('En Aktif Bölümler', 'Top Active Majors')}</h3>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '-8px', marginBottom: '16px' }}>
                  {tr('1.600+ kişi tarafından kullanıldı', 'Used by 1,600+ people')}
                </span>
                <ul className="recap-major-list">
                  {stats.topMajors.map((item, idx) => (
                    <li key={idx}>
                      <span className="recap-major-name"><strong>{idx + 1}.</strong> {item.major}</span>
                      <span className="recap-major-count">{item.count} {tr('Kişi', 'Users')}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="recap-highlight-box recap-highlight-classes" style={{ display: 'flex', flexDirection: 'column' }}>
                <h3>{tr('Sınıflara Göre Dağılım', 'Distribution by Year')}</h3>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '-8px', marginBottom: '8px' }}>
                  {tr('*Sınıfını belirten 1.231 öğrenci verisiyle', '*Based on 1,231 users who specified their year')}
                </span>
                <ul className="recap-major-list" style={{ marginTop: 'var(--space-2)' }}>
                  {stats.classDistribution.map((item, idx) => (
                    <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-secondary)' }}>
                      <span className="recap-major-name"><strong>{item.class}</strong></span>
                      <span className="recap-major-count">{item.count} {tr('Kişi', 'Users')}</span>
                    </li>
                  ))}
                </ul>
                
                <h3 style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px dashed var(--border-primary)' }}>
                  {tr('Diğer Sistem Etkileşimleri', 'Other System Interactions')}
                </h3>
                <ul className="recap-major-list" style={{ marginTop: 'var(--space-2)' }}>
                  {stats.extraStats.map((item, idx) => (
                    <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-secondary)' }}>
                      <span className="recap-major-name"><strong>{item.label}</strong></span>
                      <span className="recap-major-count" style={{ color: 'var(--accent-primary)' }}>{item.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </article>

        {/* Step 3: Anket Sonuçları */}
        <article className="recap-step">
          <span className="recap-step-number">3</span>
          <div className="recap-step-body">
            <h2>{tr('Kullanıcı Deneyimi Anketi', 'User Experience Survey')}</h2>
            <p>{tr(`${survey.totalResponses} öğrencinin geri bildirimine dayanan anket sonuçları.`, `Survey results based on feedback from ${survey.totalResponses} students.`)}</p>
            
            <div className="recap-survey-questions">
              <div className="recap-q-block">
                <div className="recap-q-asked">
                  <span>{tr('Genel olarak UniPlanners deneyiminizi 5 üzerinden nasıl puanlarsınız?', 'How would you rate your overall UniPlanners experience out of 5?')}</span>
                </div>
                <div className="recap-q-response">
                  <span className="recap-q-score">{survey.generalRating}</span>
                  <span className="recap-q-label">{tr('Ortalama', 'Avg Score')}</span>
                </div>
              </div>
              
              <div className="recap-q-block">
                <div className="recap-q-asked">
                  <span>{tr("UniPlanners'ın arayüz tasarımı (renkler, düzen, yazı tipi) ve kullanım kolaylığını nasıl puanlarsınız?", 'How would you rate UniPlanners\' UI design and usability?')}</span>
                </div>
                <div className="recap-q-response">
                  <span className="recap-q-score">{survey.uiRating}</span>
                  <span className="recap-q-label">{tr('Ortalama', 'Avg Score')}</span>
                </div>
              </div>
              
              <div className="recap-q-block">
                <div className="recap-q-asked">
                  <span>{tr('UniPlanners uygulamasını arkadaşlarınıza önerir miydiniz?', 'Would you recommend the UniPlanners app to your friends?')}</span>
                </div>
                <div className="recap-q-response">
                  <span className="recap-q-score">{survey.recommendation}</span>
                  <span className="recap-q-label">{tr('Ortalama', 'Avg Score')}</span>
                </div>
              </div>
            </div>

            <div className="recap-favorites-box">
              <h3>{tr('En Sevilen Özellikler', 'Favorite Features')}</h3>
              <ul>
                <li>{tr('Kombinasyonları kolayca görebilme', 'Easily seeing schedule combinations')}</li>
                <li>{tr('Programa uyan diğer dersleri bulabilme', 'Finding courses that fit the schedule')}</li>
                <li>{tr('Kayıtsız, giriş yapmadan hızlı kullanım', 'Fast, registration-free experience')}</li>
                <li>{tr('Boş gün seçebilme', 'Selecting free days')}</li>
              </ul>
            </div>
          </div>
        </article>

        {/* Step 4: Yorumlar */}
        <article className="recap-step">
          <span className="recap-step-number">4</span>
          <div className="recap-step-body">
            <h2>{tr('Kullanıcı Yorumları', 'User Comments')}</h2>
            <p>{tr('Gelen güzel mesajlardan bazıları.', 'Some of the wonderful messages received.')}</p>
            
            <div className="recap-comments-grid">
              {userComments.map((comment, i) => (
                <div key={i} className="recap-comment-box">
                  <p>"{comment}"</p>
                </div>
              ))}
            </div>
          </div>
        </article>

      </section>

      <section className="recap-footer-cta">
        <h2>{tr('Destekleriniz için teşekkürler.', 'Thank you for your support.')}</h2>
        <p>{tr('Gelecek ders kayıtlarında görüşmek üzere!', 'See you in the next registration period!')}</p>
      </section>
    </main>
  );
}
