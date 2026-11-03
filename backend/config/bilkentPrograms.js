// Bilkent programs: one per catalog department. Mirrors frontend/src/data/programs.js
// (same ids, codes and names). `id` is the curriculum file in
// frontend/public/data/bilkent; the code is the department's course prefix,
// which is also the major code students pick.
export const BILKENT_FACULTIES = [
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

export const BILKENT_PROGRAMS = [
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

export const BILKENT_PROGRAM_BY_ID = new Map(BILKENT_PROGRAMS.map(program => [program.id, program]))
export const BILKENT_PROGRAM_BY_CODE = new Map(BILKENT_PROGRAMS.flatMap(program => program.codes.map(code => [code, program])))
