const FACULTIES = [
  { id: 'aviation', tr: 'Havacılık ve Uzay Bilimleri Fakültesi', en: 'Faculty of Aviation and Aeronautical Sciences' },
  { id: 'law', tr: 'Hukuk Fakültesi', en: 'Faculty of Law' },
  { id: 'business', tr: 'İşletme Fakültesi', en: 'Faculty of Business' },
  { id: 'architecture', tr: 'Mimarlık ve Tasarım Fakültesi', en: 'Faculty of Architecture and Design' },
  { id: 'engineering', tr: 'Mühendislik Fakültesi', en: 'Faculty of Engineering' },
  { id: 'social', tr: 'Sosyal Bilimler Fakültesi', en: 'Faculty of Social Sciences' },
  { id: 'applied', tr: 'Uygulamalı Bilimler Fakültesi', en: 'Faculty of Applied Sciences' },
]

const PROGRAMS = [
  { id: 'avm', faculty: 'aviation', tr: 'Havacılık Yönetimi', en: 'Aviation Management', codes: ['BSAVM', 'BSATM'] },
  { id: 'plt', faculty: 'aviation', tr: 'Pilotaj', en: 'Pilotage', codes: ['BSPLT', 'BSPF'] },

  { id: 'huk', faculty: 'law', tr: 'Hukuk', en: 'Law', codes: ['BLAW'] },

  { id: 'econ', faculty: 'business', tr: 'Ekonomi', en: 'Economics', codes: ['BAECON'] },
  { id: 'entr', faculty: 'business', tr: 'Girişimcilik', en: 'Entrepreneurship', codes: ['BAENT'] },
  { id: 'bus', faculty: 'business', tr: 'İşletme', en: 'Business Administration', codes: ['BABUS'] },
  { id: 'uf', faculty: 'business', tr: 'Uluslararası Finans', en: 'International Finance', codes: ['BABAF'] },
  { id: 'uti', faculty: 'business', tr: 'Uluslararası Ticaret ve İşletmecilik', en: 'International Trade and Business', codes: ['BAIB', 'BAIBUS'] },
  { id: 'mis', faculty: 'business', tr: 'Yönetim Bilişim Sistemleri', en: 'Management Information Systems', codes: ['BAMIS'] },

  { id: 'ide', faculty: 'architecture', tr: 'Endüstriyel Tasarım', en: 'Industrial Design', codes: ['BSIDE', 'BSIPD'] },
  { id: 'inar', faculty: 'architecture', tr: 'İç Mimarlık ve Çevre Tasarımı', en: 'Interior Architecture and Environmental Design', codes: ['BSINTAR'] },
  { id: 'code', faculty: 'architecture', tr: 'İletişim Tasarımı', en: 'Communication Design', codes: ['BSCOD', 'BSCODE'] },
  { id: 'arch_en', faculty: 'architecture', tr: 'Mimarlık (İngilizce)', en: 'Architecture (English)', codes: ['BSARCH (ENG)'] },
  { id: 'arch_tr', faculty: 'architecture', tr: 'Mimarlık (Türkçe)', en: 'Architecture (Turkish)', codes: ['BSARCH (TR)'] },

  { id: 'cs', faculty: 'engineering', tr: 'Bilgisayar Mühendisliği', en: 'Computer Science', codes: ['BSCS'] },
  { id: 'ee', faculty: 'engineering', tr: 'Elektrik-Elektronik Mühendisliği', en: 'Electrical-Electronics Engineering', codes: ['BSEE'] },
  { id: 'ie', faculty: 'engineering', tr: 'Endüstri Mühendisliği', en: 'Industrial Engineering', codes: ['BSIE'] },
  { id: 'ce', faculty: 'engineering', tr: 'İnşaat Mühendisliği', en: 'Civil Engineering', codes: ['BSCE'] },
  { id: 'me', faculty: 'engineering', tr: 'Makina Mühendisliği', en: 'Mechanical Engineering', codes: ['BSME'] },
  { id: 'ai', faculty: 'engineering', tr: 'Yapay Zeka ve Veri Mühendisliği', en: 'Artificial Intelligence and Data Engineering', codes: ['BSAI'] },

  { id: 'anth', faculty: 'social', tr: 'Antropoloji', en: 'Anthropology', codes: ['BAANTH'] },
  { id: 'psy', faculty: 'social', tr: 'Psikoloji', en: 'Psychology', codes: ['BAPSYC'] },
  { id: 'ir', faculty: 'social', tr: 'Uluslararası İlişkiler', en: 'International Relations', codes: ['BAIR'] },

  { id: 'garm', faculty: 'applied', tr: 'Gastronomi ve Mutfak Sanatları', en: 'Gastronomy and Culinary Arts', codes: ['BSGARM', 'BSGCA'] },
  { id: 'hman', faculty: 'applied', tr: 'Otel Yöneticiliği', en: 'Hotel Management', codes: ['BSHMAN', 'BSHOTM'] },
]

const programByCode = new Map(PROGRAMS.flatMap(program => program.codes.map(code => [code, program])))
const programById = new Map(PROGRAMS.map(program => [program.id, program]))

const titleFor = (item, language) => item[language === 'tr' ? 'tr' : 'en']
const collatorFor = language => new Intl.Collator(language === 'tr' ? 'tr-TR' : 'en-US', { sensitivity: 'base' })
const formatLabel = (program, language, codes = program.codes) => `${titleFor(program, language)} (${codes.join(' / ')})`

export function canonicalProgramCode(code) {
  if (!code || code === 'none') return code
  return programByCode.get(code)?.codes[0] || code
}

export function equivalentProgramCodes(code) {
  if (!code || ['none', 'master', 'doctorate'].includes(code)) return []
  return programByCode.get(code)?.codes || [code]
}

export function curriculumIdForProgramCode(code) {
  if (!code || code === 'none') return ''
  return programByCode.get(code)?.id || ''
}

export function programCodeForCurriculumId(id, availableCodes = []) {
  const program = programById.get(id)
  if (!program) return ''
  const available = new Set(availableCodes)
  return program.codes.find(code => available.has(code)) || program.codes[0]
}

export function groupMajorOptions(availableCodes = [], language = 'tr') {
  const available = new Set(availableCodes)
  const collator = collatorFor(language)

  return FACULTIES.map(faculty => ({
    id: faculty.id,
    label: titleFor(faculty, language),
    programs: PROGRAMS
      .filter(program => program.faculty === faculty.id && program.codes.some(code => available.has(code)))
      .map(program => {
        const codes = program.codes.filter(code => available.has(code))
        return { value: codes[0], title: titleFor(program, language), label: formatLabel(program, language, codes) }
      })
      .sort((a, b) => collator.compare(a.label, b.label)),
  })).filter(group => group.programs.length > 0)
}

export function groupCurriculumOptions(curriculums = [], language = 'tr') {
  const collator = collatorFor(language)
  const availableById = new Map(curriculums.map(curriculum => [curriculum.id, curriculum]))

  return FACULTIES.map(faculty => ({
    id: faculty.id,
    label: titleFor(faculty, language),
    programs: PROGRAMS
      .filter(program => program.faculty === faculty.id && availableById.has(program.id))
      .map(program => {
        const curriculum = availableById.get(program.id)
        const codes = curriculum.programCodes?.length ? curriculum.programCodes : program.codes
        return { ...curriculum, label: formatLabel(program, language, codes) }
      })
      .sort((a, b) => collator.compare(a.label, b.label)),
  })).filter(group => group.programs.length > 0)
}
