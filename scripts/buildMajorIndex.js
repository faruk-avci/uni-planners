#!/usr/bin/env node
/**
 * buildMajorIndex.js
 * 
 * Parses all 25 curriculum JSONs from the v1 frontend data directory
 * and builds two outputs:
 * 
 * 1. course_major_index.json — reverse index: courseCode → [{ majorId, majorName, type }]
 *    Shows which majors include which course, and whether it's mandatory or elective.
 * 
 * 2. major_courses.json — forward index: majorId → { mandatory: [...], electives: { free: [...], program: [...], ... } }
 *    Shows all courses for each major.
 * 
 * Usage: node scripts/buildMajorIndex.js
 */

const fs = require('fs');
const path = require('path');

// Path to v1 curriculum data
const CURRICULUM_DIR = path.join(__dirname, '..', '..', 'ozu-planner', 'frontend', 'src', 'data', 'curriculums');
const OUTPUT_DIR = path.join(__dirname, '..', 'data');

// Major ID → human-readable name mapping
const MAJOR_NAMES = {
  'ai': { en: 'Artificial Intelligence and Data Engineering', tr: 'Yapay Zeka ve Veri Mühendisliği' },
  'anth': { en: 'Anthropology', tr: 'Antropoloji' },
  'arch_en': { en: 'Architecture (English)', tr: 'Mimarlık (İngilizce)' },
  'arch_tr': { en: 'Architecture (Turkish)', tr: 'Mimarlık (Türkçe)' },
  'avm': { en: 'Aviation Management', tr: 'Havacılık Yönetimi' },
  'bus': { en: 'Business Administration', tr: 'İşletme' },
  'ce': { en: 'Civil Engineering', tr: 'İnşaat Mühendisliği' },
  'code': { en: 'Communication and Design', tr: 'İletişim ve Tasarımı' },
  'cs': { en: 'Computer Engineering', tr: 'Bilgisayar Mühendisliği' },
  'econ': { en: 'Economics', tr: 'Ekonomi' },
  'ee': { en: 'Electrical-Electronics Engineering', tr: 'Elektrik-Elektronik Mühendisliği' },
  'entr': { en: 'Entrepreneurship', tr: 'Girişimcilik' },
  'garm': { en: 'Gastronomy and Culinary Arts', tr: 'Gastronomi ve Mutfak Sanatları' },
  'hman': { en: 'Hotel Management', tr: 'Otel Yöneticiliği' },
  'huk': { en: 'Law', tr: 'Hukuk' },
  'ide': { en: 'Industrial Design', tr: 'Endüstriyel Tasarım' },
  'ie': { en: 'Industrial Engineering', tr: 'Endüstri Mühendisliği' },
  'inar': { en: 'Interior Architecture and Environmental Design', tr: 'İç Mimarlık ve Çevre Tasarımı' },
  'ir': { en: 'International Relations', tr: 'Uluslararası İlişkiler' },
  'me': { en: 'Mechanical Engineering', tr: 'Makine Mühendisliği' },
  'mis': { en: 'Management Information Systems', tr: 'Yönetim Bilişim Sistemleri' },
  'plt': { en: 'Pilot Training', tr: 'Pilotaj' },
  'psy': { en: 'Psychology', tr: 'Psikoloji' },
  'uf': { en: 'International Finance', tr: 'Uluslararası Finans' },
  'uti': { en: 'International Trade and Business Management', tr: 'Uluslararası Ticaret ve İşletmecilik' },
};

// File name → major ID mapping
const FILE_TO_MAJOR = {
  'ai.json': 'ai',
  'anth.json': 'anth',
  'arch_en.json': 'arch_en',
  'arch_tr.json': 'arch_tr',
  'avm.json': 'avm',
  'bus.json': 'bus',
  'ce.json': 'ce',
  'code.json': 'code',
  'cs.json': 'cs',
  'econ.json': 'econ',
  'ee.json': 'ee',
  'entr.json': 'entr',
  'garm.json': 'garm',
  'hman.json': 'hman',
  'huk.json': 'huk',
  'ide.json': 'ide',
  'ie.json': 'ie',
  'inar.json': 'inar',
  'ir.json': 'ir',
  'me.json': 'me',
  'mis.json': 'mis',
  'plt.json': 'plt',
  'psy.json': 'psy',
  'uf.json': 'uf',
  'uti.json': 'uti',
};

function normalizeCourseCode(code) {
  // "CS 101" → "CS101", "MATH 103" → "MATH103"
  return code.replace(/\s+/g, '').toUpperCase();
}

function extractCoursesFromCurriculum(data, majorId) {
  const result = {
    mandatory: [],
    electives: {}
  };

  // Extract mandatory courses from semesters
  if (data.semesters) {
    for (const [year, sems] of Object.entries(data.semesters)) {
      for (const [sem, courses] of Object.entries(sems)) {
        for (const course of courses) {
          if (course.code) {
            result.mandatory.push({
              code: course.code,
              normalizedCode: normalizeCourseCode(course.code),
              title_tr: course.title_tr,
              title_en: course.title_en,
              credits: course.credits,
              year: parseInt(year),
              semester: sem,
              prereq: course.prereq || '',
              coreq: course.coreq || '',
              opened: course.opened
            });
          }
        }
      }
    }
  }

  // Extract elective pools
  if (data.electives) {
    for (const [poolType, courses] of Object.entries(data.electives)) {
      result.electives[poolType] = courses
        .filter(c => c.code)
        .map(course => ({
          code: course.code,
          normalizedCode: normalizeCourseCode(course.code),
          title_tr: course.title_tr,
          title_en: course.title_en,
          credits: course.credits,
          prereq: course.prereq || '',
          coreq: course.coreq || '',
          opened: course.opened
        }));
    }
  }

  return result;
}

function buildIndices() {
  console.log('🔨 Building course-major index...\n');
  
  // Forward index: majorId → courses
  const majorCourses = {};
  
  // Reverse index: courseCode → [{ majorId, type, ... }]
  const courseIndex = {};
  
  // Stats
  let totalFiles = 0;
  let totalMandatory = 0;
  let totalElective = 0;
  const uniqueCourses = new Set();

  const files = fs.readdirSync(CURRICULUM_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const majorId = FILE_TO_MAJOR[file];
    if (!majorId) {
      console.warn(`  ⚠️ Unknown file: ${file}, skipping`);
      continue;
    }

    const filePath = path.join(CURRICULUM_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const majorName = MAJOR_NAMES[majorId] || { en: majorId, tr: majorId };
    
    const extracted = extractCoursesFromCurriculum(data, majorId);
    
    // Store forward index
    majorCourses[majorId] = {
      id: majorId,
      name: majorName,
      faculty: data.faculty || '',
      mandatory: extracted.mandatory,
      electives: extracted.electives
    };

    // Build reverse index — mandatory courses
    for (const course of extracted.mandatory) {
      const key = course.normalizedCode;
      uniqueCourses.add(key);
      
      if (!courseIndex[key]) {
        courseIndex[key] = {
          code: course.code,
          normalizedCode: key,
          title_tr: course.title_tr,
          title_en: course.title_en,
          credits: course.credits,
          majors: []
        };
      }
      
      // Avoid duplicate entries
      if (!courseIndex[key].majors.find(m => m.majorId === majorId && m.type === 'mandatory')) {
        courseIndex[key].majors.push({
          majorId,
          majorName: majorName.en,
          type: 'mandatory',
          year: course.year,
          semester: course.semester
        });
        totalMandatory++;
      }
    }

    // Build reverse index — elective courses
    for (const [poolType, courses] of Object.entries(extracted.electives)) {
      for (const course of courses) {
        const key = course.normalizedCode;
        uniqueCourses.add(key);
        
        if (!courseIndex[key]) {
          courseIndex[key] = {
            code: course.code,
            normalizedCode: key,
            title_tr: course.title_tr,
            title_en: course.title_en,
            credits: course.credits,
            majors: []
          };
        }
        
        if (!courseIndex[key].majors.find(m => m.majorId === majorId && m.type === poolType)) {
          courseIndex[key].majors.push({
            majorId,
            majorName: majorName.en,
            type: poolType  // "free", "program", "social", etc.
          });
          totalElective++;
        }
      }
    }

    totalFiles++;
    console.log(`  ✅ ${file} → ${majorId} (${extracted.mandatory.length} mandatory, ${Object.values(extracted.electives).reduce((sum, arr) => sum + arr.length, 0)} elective)`);
  }

  // Sort majors in each course entry for consistency
  for (const course of Object.values(courseIndex)) {
    course.majors.sort((a, b) => {
      // mandatory first, then alphabetical
      if (a.type === 'mandatory' && b.type !== 'mandatory') return -1;
      if (a.type !== 'mandatory' && b.type === 'mandatory') return 1;
      return a.majorId.localeCompare(b.majorId);
    });
  }

  // Write outputs
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const courseIndexPath = path.join(OUTPUT_DIR, 'course_major_index.json');
  fs.writeFileSync(courseIndexPath, JSON.stringify(courseIndex, null, 2));

  const majorCoursesPath = path.join(OUTPUT_DIR, 'major_courses.json');
  fs.writeFileSync(majorCoursesPath, JSON.stringify(majorCourses, null, 2));

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 BUILD SUMMARY');
  console.log('='.repeat(50));
  console.log(`  Files processed:      ${totalFiles}`);
  console.log(`  Unique course codes:  ${uniqueCourses.size}`);
  console.log(`  Mandatory mappings:   ${totalMandatory}`);
  console.log(`  Elective mappings:    ${totalElective}`);
  console.log(`  Total mappings:       ${totalMandatory + totalElective}`);
  console.log('');
  console.log(`  📄 ${courseIndexPath}`);
  console.log(`  📄 ${majorCoursesPath}`);
  console.log('');

  // Show sample: courses shared by most majors
  const sharedCourses = Object.values(courseIndex)
    .filter(c => c.majors.filter(m => m.type === 'mandatory').length >= 5)
    .sort((a, b) => b.majors.length - a.majors.length)
    .slice(0, 15);

  if (sharedCourses.length > 0) {
    console.log('🔗 Most shared courses (mandatory in 5+ majors):');
    for (const c of sharedCourses) {
      const mandatoryCount = c.majors.filter(m => m.type === 'mandatory').length;
      const majorList = c.majors.filter(m => m.type === 'mandatory').map(m => m.majorId).join(', ');
      console.log(`  ${c.code.padEnd(12)} → ${mandatoryCount} majors (${majorList})`);
    }
  }

  // Show courses unique to one major
  const uniqueToOneMajor = Object.values(courseIndex)
    .filter(c => c.majors.filter(m => m.type === 'mandatory').length === 1)
    .length;
  console.log(`\n  🎯 Courses unique to a single major (mandatory): ${uniqueToOneMajor}`);
}

buildIndices();
