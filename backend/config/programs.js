export const FACULTIES = [
  { id: 'aviation', tr: 'Havacılık ve Uzay Bilimleri Fakültesi', en: 'Faculty of Aviation and Aeronautical Sciences' },
  { id: 'law', tr: 'Hukuk Fakültesi', en: 'Faculty of Law' },
  { id: 'business', tr: 'İşletme Fakültesi', en: 'Faculty of Business' },
  { id: 'architecture', tr: 'Mimarlık ve Tasarım Fakültesi', en: 'Faculty of Architecture and Design' },
  { id: 'engineering', tr: 'Mühendislik Fakültesi', en: 'Faculty of Engineering' },
  { id: 'social', tr: 'Sosyal Bilimler Fakültesi', en: 'Faculty of Social Sciences' },
  { id: 'applied', tr: 'Uygulamalı Bilimler Fakültesi', en: 'Faculty of Applied Sciences' },
]

export const PROGRAMS = [
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

export const PROGRAM_BY_ID = new Map(PROGRAMS.map(program => [program.id, program]))
