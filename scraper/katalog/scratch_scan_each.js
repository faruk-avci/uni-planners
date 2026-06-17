import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const downloadsDir = '/home/eo/Desktop/ozu-planner-v2/scraper/katalog/downloads';

function scanSyllabus(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      scanSyllabus(filePath);
    } else if (file.toLowerCase().endsWith('.pdf')) {
      try {
        const text = execSync(`pdftotext -layout "${filePath}" -`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        if (/midterm/i.test(text) && /each/i.test(text)) {
          // Let's print details
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (/each/i.test(lines[i]) && (/midterm/i.test(lines[i]) || (i > 0 && /midterm/i.test(lines[i-1])) || (i > 1 && /midterm/i.test(lines[i-2])))) {
              console.log(`Match in ${filePath}:`);
              console.log(`  L${i-1}: ${lines[i-2] || ''}`);
              console.log(`  L${i}: ${lines[i-1] || ''}`);
              console.log(`  L${i+1}: ${lines[i]}`);
              console.log(`  L${i+2}: ${lines[i+1] || ''}`);
              console.log('---');
            }
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }
}

scanSyllabus(downloadsDir);
