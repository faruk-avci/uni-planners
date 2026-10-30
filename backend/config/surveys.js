// In-site surveys, one per university. The questions mirror the original
// Google Form (minus its optional e-mail field: responses are anonymous).
// Bump `version` whenever questions change so results stay comparable.

const OZYEGIN_FAVORITES = [
  { value: 'combinations', tr: 'Kombinasyonları kolayca görebilme', en: 'Seeing combinations easily' },
  { value: 'fitting', tr: 'Programa uyan diğer dersleri görebilme', en: 'Seeing other courses that fit the schedule' },
  { value: 'free_day', tr: 'Boş gün seçebilme', en: 'Choosing free days' },
  { value: 'saved_baskets', tr: 'Ders sepeti kaydetme - farklı kombinasyonlar deneme', en: 'Saving baskets to try different combinations' },
  { value: 'no_login', tr: 'Kayıt ve giriş gerektirmeden kullanım', en: 'Using it without signing up' },
  { value: 'curriculum', tr: 'Müfredat entegrasyonu', en: 'Curriculum integration' },
  { value: 'export', tr: 'Takvime ekleme / PNG dışa aktarma', en: 'Calendar / PNG export' },
  { value: 'share', tr: 'Program paylaşma', en: 'Sharing schedules' },
  { value: 'themes', tr: 'Tema ve renk seçenekleri', en: 'Themes and colors' },
]

export const SURVEYS = {
  ozyegin: {
    version: 1,
    title: { tr: 'UniPlanners Kullanıcı Deneyimi Anketi', en: 'UniPlanners Experience Survey' },
    questions: [
      {
        key: 'overall', type: 'scale', min: 1, max: 5, required: true,
        label: { tr: 'Genel olarak UniPlanners deneyimini 5 üzerinden nasıl puanlarsın?', en: 'How would you rate your overall UniPlanners experience out of 5?' },
      },
      {
        key: 'design', type: 'scale', min: 1, max: 10, required: true,
        label: { tr: 'Arayüz tasarımını (renkler, düzen, yazı tipi) ve kullanım kolaylığını nasıl puanlarsın?', en: 'How would you rate the interface design (colors, layout, font) and ease of use?' },
      },
      {
        key: 'recommend', type: 'scale', min: 1, max: 10, required: true,
        label: { tr: 'UniPlanners’ı arkadaşlarına önerir miydin?', en: 'Would you recommend UniPlanners to your friends?' },
        hint: { tr: '1 = hiç önermem, 10 = kesinlikle öneririm', en: '1 = never, 10 = definitely' },
      },
      {
        key: 'favorites', type: 'multi', required: false, options: OZYEGIN_FAVORITES, allowOther: true,
        label: { tr: 'En sevdiğin özellik(ler) hangisi?', en: 'Which feature(s) do you like most?' },
      },
      {
        key: 'improve', type: 'text', maxLength: 1000, required: false,
        label: { tr: 'Uygulamada geliştirilmesini istediğin noktalar neler?', en: 'What would you like us to improve?' },
      },
      {
        key: 'comments', type: 'text', maxLength: 1000, required: false,
        label: { tr: 'Varsa, uygulama hakkındaki diğer düşüncelerin', en: 'Any other thoughts about the app' },
      },
    ],
  },
}

const OTHER_MAX_LENGTH = 200

// Returns { answers } with only known keys and clean values, or { error }.
export function validateSurveyAnswers(survey, input) {
  const raw = input && typeof input === 'object' ? input : {}
  const answers = {}
  for (const question of survey.questions) {
    const value = raw[question.key]
    if (question.type === 'scale') {
      const number = Number(value)
      if (value === undefined || value === null || value === '') {
        if (question.required) return { error: `missing:${question.key}` }
        continue
      }
      if (!Number.isInteger(number) || number < question.min || number > question.max) return { error: `invalid:${question.key}` }
      answers[question.key] = number
    } else if (question.type === 'multi') {
      const allowed = new Set(question.options.map(option => option.value))
      const picked = Array.isArray(value?.selected) ? value.selected : []
      const selected = [...new Set(picked.filter(item => allowed.has(item)))]
      const other = question.allowOther ? String(value?.other || '').trim().slice(0, OTHER_MAX_LENGTH) : ''
      if (question.required && selected.length === 0 && !other) return { error: `missing:${question.key}` }
      if (selected.length > 0 || other) answers[question.key] = { selected, ...(other ? { other } : {}) }
    } else if (question.type === 'text') {
      const text = String(value || '').trim().slice(0, question.maxLength)
      if (question.required && !text) return { error: `missing:${question.key}` }
      if (text) answers[question.key] = text
    }
  }
  return { answers }
}

// What the browser needs to render the form.
export function publicSurvey(slug) {
  const survey = SURVEYS[slug]
  if (!survey) return null
  return { university: slug, version: survey.version, title: survey.title, questions: survey.questions }
}
