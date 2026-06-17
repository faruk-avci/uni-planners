import fs from 'fs';

const codes = JSON.parse(fs.readFileSync('codes.json', 'utf8'));
const activeSubjects = codes.DATA.rows
  .filter(r => r.SUBJECTTYPE === '1')
  .map(r => r.NAME);

console.log('Active Subjects Count:', activeSubjects.length);
console.log('Active Subjects:', activeSubjects.join(', '));
