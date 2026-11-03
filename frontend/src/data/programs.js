import { UNIVERSITY } from './university'

const OZYEGIN_FACULTIES = [
  { id: 'aviation', tr: 'Havacılık ve Uzay Bilimleri Fakültesi', en: 'Faculty of Aviation and Aeronautical Sciences' },
  { id: 'law', tr: 'Hukuk Fakültesi', en: 'Faculty of Law' },
  { id: 'business', tr: 'İşletme Fakültesi', en: 'Faculty of Business' },
  { id: 'architecture', tr: 'Mimarlık ve Tasarım Fakültesi', en: 'Faculty of Architecture and Design' },
  { id: 'engineering', tr: 'Mühendislik Fakültesi', en: 'Faculty of Engineering' },
  { id: 'social', tr: 'Sosyal Bilimler Fakültesi', en: 'Faculty of Social Sciences' },
  { id: 'applied', tr: 'Uygulamalı Bilimler Fakültesi', en: 'Faculty of Applied Sciences' },
]

const OZYEGIN_PROGRAMS = [
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

// Bilkent: one program per catalog department. `id` is the curriculum file
// (public/data/bilkent/<id>.json); the code is the department's course prefix.
const BILKENT_FACULTIES = [
  { id: 'engineering', tr: 'Mühendislik Fakültesi', en: 'Faculty of Engineering' },
  { id: 'science', tr: 'Fen Fakültesi', en: 'Faculty of Science' },
  { id: 'feass', tr: 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', en: 'Faculty of Economics, Administrative and Social Sciences' },
  { id: 'business', tr: 'İşletme Fakültesi', en: 'Faculty of Business Administration' },
  { id: 'fada', tr: 'Güzel Sanatlar, Tasarım ve Mimarlık Fakültesi', en: 'Faculty of Art, Design and Architecture' },
  { id: 'humanities', tr: 'İnsani Bilimler ve Edebiyat Fakültesi', en: 'Faculty of Humanities and Letters' },
  { id: 'law', tr: 'Hukuk Fakültesi', en: 'Faculty of Law' },
  { id: 'education', tr: 'Eğitim Fakültesi', en: 'Faculty of Education' },
  { id: 'music', tr: 'Müzik ve Sahne Sanatları Fakültesi', en: 'Faculty of Music and Performing Arts' },
  { id: 'applied', tr: 'Uygulamalı Teknoloji ve İşletme Yüksekokulu', en: 'School of Applied Technology and Management' },
]

const BILKENT_PROGRAMS = [
  { id: 'bilkent-d11', faculty: 'engineering', tr: 'Bilgisayar Mühendisliği', en: 'Computer Engineering', codes: ['CS'] },
  { id: 'bilkent-d12', faculty: 'engineering', tr: 'Elektrik - Elektronik Mühendisliği', en: 'Electrical and Electronics Engineering', codes: ['EEE'] },
  { id: 'bilkent-d13', faculty: 'engineering', tr: 'Endüstri Mühendisliği', en: 'Industrial Engineering', codes: ['IE'] },
  { id: 'bilkent-d16', faculty: 'engineering', tr: 'Makine Mühendisliği', en: 'Mechanical Engineering', codes: ['ME'] },

  { id: 'bilkent-d01', faculty: 'science', tr: 'Fizik', en: 'Physics', codes: ['PHYS'] },
  { id: 'bilkent-d02', faculty: 'science', tr: 'Kimya', en: 'Chemistry', codes: ['CHEM'] },
  { id: 'bilkent-d03', faculty: 'science', tr: 'Matematik', en: 'Mathematics', codes: ['MATH'] },
  { id: 'bilkent-d04', faculty: 'science', tr: 'Moleküler Biyoloji ve Genetik', en: 'Molecular Biology and Genetics', codes: ['MBG'] },

  { id: 'bilkent-d32', faculty: 'feass', tr: 'İktisat', en: 'Economics', codes: ['ECON'] },
  { id: 'bilkent-d33', faculty: 'feass', tr: 'Uluslararası İlişkiler', en: 'International Relations', codes: ['IR'] },
  { id: 'bilkent-d34', faculty: 'feass', tr: 'Siyaset Bilimi ve Kamu Yönetimi', en: 'Political Science and Public Administration', codes: ['POLS'] },
  { id: 'bilkent-d92', faculty: 'feass', tr: 'Psikoloji', en: 'Psychology', codes: ['PSYC'] },

  { id: 'bilkent-d31', faculty: 'business', tr: 'İşletme', en: 'Management', codes: ['MAN'] },

  { id: 'bilkent-d70', faculty: 'fada', tr: 'Mimarlık', en: 'Architecture', codes: ['ARCH'] },
  { id: 'bilkent-d77', faculty: 'fada', tr: 'İletişim ve Tasarımı', en: 'Communication and Design', codes: ['COMD'] },
  { id: 'bilkent-d74', faculty: 'fada', tr: 'Güzel Sanatlar', en: 'Fine Arts', codes: ['FA'] },
  { id: 'bilkent-d72', faculty: 'fada', tr: 'Grafik Tasarımı', en: 'Graphic Design', codes: ['GRA'] },
  { id: 'bilkent-d71', faculty: 'fada', tr: 'İç Mimarlık ve Çevre Tasarımı', en: 'Interior Architecture and Environmental Design', codes: ['IAED'] },
  { id: 'bilkent-d75', faculty: 'fada', tr: 'Kentsel Tasarım ve Peyzaj Mimarlığı', en: 'Urban Design and Landscape Architecture', codes: ['LAUD'] },

  { id: 'bilkent-d22', faculty: 'humanities', tr: 'Amerikan Kültürü ve Edebiyatı', en: 'American Culture and Literature', codes: ['AMER'] },
  { id: 'bilkent-d23', faculty: 'humanities', tr: 'Arkeoloji', en: 'Archaeology', codes: ['HART'] },
  { id: 'bilkent-d21', faculty: 'humanities', tr: 'İngiliz Dili ve Edebiyatı', en: 'English Language and Literature', codes: ['ELIT'] },
  { id: 'bilkent-d25', faculty: 'humanities', tr: 'Felsefe', en: 'Philosophy', codes: ['PHIL'] },
  { id: 'bilkent-d89', faculty: 'humanities', tr: 'İngilizce, Fransızca Mütercim ve Tercümanlık', en: 'English and French Translation and Interpretation', codes: ['TRIN'] },

  { id: 'bilkent-d45', faculty: 'law', tr: 'Hukuk', en: 'Law', codes: ['LAW'] },

  { id: 'bilkent-d09', faculty: 'education', tr: 'Sınıf Öğretmenliği', en: 'Primary Teacher Education', codes: ['EDU'] },

  { id: 'bilkent-d41', faculty: 'music', tr: 'Müzik', en: 'Music', codes: ['MSC'] },
  { id: 'bilkent-d42', faculty: 'music', tr: 'Tiyatro', en: 'Theatre', codes: ['THR'] },

  { id: 'bilkent-d18', faculty: 'applied', tr: 'Bilişim Sistemleri ve Teknolojileri', en: 'Information Systems and Technologies', codes: ['CTIS'] },
  { id: 'bilkent-d19', faculty: 'applied', tr: 'Turizm ve Otel İşletmeciliği', en: 'Tourism and Hotel Management', codes: ['THM'] },
]

const CATALOGS = {
  ozyegin: { faculties: OZYEGIN_FACULTIES, programs: OZYEGIN_PROGRAMS },
  bilkent: { faculties: BILKENT_FACULTIES, programs: BILKENT_PROGRAMS },
}
const FACULTIES = CATALOGS[UNIVERSITY].faculties
const PROGRAMS = CATALOGS[UNIVERSITY].programs

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
