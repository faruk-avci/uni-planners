import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRAM_CODES = {
  ai: ['BSAI'], anth: ['BAANTH'], arch_en: ['BSARCH (ENG)'], arch_tr: ['BSARCH (TR)'],
  avm: ['BSAVM', 'BSATM'], bus: ['BABUS'], ce: ['BSCE'], code: ['BSCOD', 'BSCODE'],
  cs: ['BSCS'], econ: ['BAECON'], ee: ['BSEE'], entr: ['BAENT'],
  garm: ['BSGARM', 'BSGCA'], hman: ['BSHMAN', 'BSHOTM'], huk: ['BLAW'],
  ide: ['BSIDE', 'BSIPD'], ie: ['BSIE'], inar: ['BSINTAR'], ir: ['BAIR'],
  me: ['BSME'], mis: ['BAMIS'], plt: ['BSPLT', 'BSPF'], psy: ['BAPSYC'],
  uf: ['BABAF'], uti: ['BAIB', 'BAIBUS'],
};

function parseArgs() {
  const termIndex = process.argv.indexOf('--term');
  const outputIndex = process.argv.indexOf('--output');
  return {
    term: termIndex >= 0 ? process.argv[termIndex + 1] || '' : '',
    output: outputIndex >= 0 ? process.argv[outputIndex + 1] || 'course_programs.json' : 'course_programs.json'
  };
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

const config = parseArgs();
const term = config.term;
if (!term) {
  console.error('Usage: node build_program_mappings.js --term "2025 - 2026 Bahar"');
  process.exit(1);
}

const baseDir = path.join(__dirname, 'downloads', termSlug(term));
const indexPath = path.join(__dirname, '..', '..', 'data', 'course_major_index.json');
if (!fs.existsSync(baseDir)) {
  console.error(`Download directory does not exist: ${baseDir}`);
  process.exit(1);
}

const offeredCodes = new Set();
for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const subjectDir = path.join(baseDir, entry.name);
  const coursesPath = path.join(baseDir, entry.name, 'courses.json');
  if (fs.existsSync(coursesPath)) {
    for (const course of JSON.parse(fs.readFileSync(coursesPath, 'utf8'))) {
      const code = String(course.courseCode || course.code || '')
        .replace(/\s+/g, '')
        .replace(/\.[^.]+$/, '')
        .toLocaleUpperCase('tr-TR');
      if (code) offeredCodes.add(code);
    }
    continue;
  }

  // The offerings bot downloads Excel files without scraping every catalog PDF.
  // Read those files directly so program mappings can be built from one bot run.
  for (const file of fs.readdirSync(subjectDir).filter(name => name.endsWith('.xls'))) {
    const workbook = XLSX.readFile(path.join(subjectDir, file));
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    for (const row of XLSX.utils.sheet_to_json(worksheet)) {
      const subject = String(row.SUBJECT || '').trim().toUpperCase();
      const courseNo = String(row.COURSENO || '').trim();
      const code = `${subject}${courseNo}`.replace(/\s+/g, '');
      if (subject && courseNo) offeredCodes.add(code);
    }
  }
}

const curriculumIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const mappings = [...offeredCodes].sort().map(code => {
  const required = new Set();
  const elective = new Set();
  for (const major of curriculumIndex[code]?.majors || []) {
    const programCodes = PROGRAM_CODES[major.majorId] || [];
    const target = major.type === 'mandatory' ? required : elective;
    programCodes.forEach(programCode => target.add(programCode));
  }
  for (const programCode of required) elective.delete(programCode);
  return { code, required: [...required].sort(), elective: [...elective].sort() };
});

const outPath = path.join(baseDir, path.basename(config.output));
fs.writeFileSync(outPath, JSON.stringify(mappings, null, 2));
console.log(`Wrote ${mappings.length} course mappings to ${outPath}`);
