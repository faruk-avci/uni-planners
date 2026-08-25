import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    term: '',
    concurrency: 3
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') {
      config.term = args[i + 1] || '';
      i++;
    } else if (args[i] === '--concurrency') {
      config.concurrency = parseInt(args[i + 1], 10) || 3;
      i++;
    }
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

async function run() {
  const config = parseArgs();
  console.log(`🚀 Starting OZU batch scraper...`);
  console.log(`   Term:        ${config.term || '(page default)'}`);
  console.log(`   Concurrency: ${config.concurrency}`);

  console.log('📖 Loading codes.json...');
  const codesPath = path.join(__dirname, 'codes.json');
  if (!fs.existsSync(codesPath)) {
    console.error('❌ Error: codes.json not found in the current directory.');
    process.exit(1);
  }

  const codesData = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
  const activeRows = codesData.DATA.rows.filter(row => row.SUBJECTTYPE === '1');
  const majors = activeRows.map(row => row.NAME.trim());

  console.log(`🔍 Found ${majors.length} active majors to scrape.`);
  console.log('List of majors:', majors.join(', '));

  const summary = {
    successfulWithCourses: [],
    successfulEmpty: [],
    failed: []
  };

  const queue = [...majors];

  const runWorker = async () => {
    while (queue.length > 0) {
      const major = queue.shift();
      const index = majors.indexOf(major);
      console.log(`🚀 [${index + 1}/${majors.length}] Starting major: ${major}`);

      try {
        const termArg = config.term ? ` --term "${config.term}"` : '';
        const { stdout, stderr } = await execPromise(`node scraper.js --major "${major}" --headless true${termArg}`, { cwd: __dirname });

        const prefix = `[${major}] `;
        const formatted = stdout.split('\n').map(line => line ? prefix + line : '').join('\n');
        console.log(formatted);
        if (stderr.trim()) {
          console.error(stderr.split('\n').map(line => line ? prefix + line : '').join('\n'));
        }

        // Verify the result
        const majorOutputDir = config.term
          ? path.join(__dirname, 'downloads', termSlug(config.term), major)
          : path.join(__dirname, 'downloads', major);
        const coursesJsonPath = path.join(majorOutputDir, 'courses.json');

        if (fs.existsSync(coursesJsonPath)) {
          const courses = JSON.parse(fs.readFileSync(coursesJsonPath, 'utf8'));
          summary.successfulWithCourses.push({
            major,
            count: courses.length
          });
          console.log(`✅ [${major}] Completed: Found ${courses.length} courses.`);
        } else {
          summary.successfulEmpty.push(major);
          console.log(`ℹ️ [${major}] Completed: No courses offered.`);
        }
      } catch (error) {
        console.error(`💥 [${major}] Failed scraping:`, error.message);
        if (error.stdout) {
          console.error(`Stdout:`, error.stdout);
        }
        if (error.stderr) {
          console.error(`Stderr:`, error.stderr);
        }
        summary.failed.push(major);
      }

      // Small delay between runs to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  };

  const promises = [];
  const activeConcurrency = Math.min(config.concurrency, majors.length);
  for (let w = 0; w < activeConcurrency; w++) {
    promises.push(runWorker());
    // Stagger worker starts so they don't load the UI at the same exact millisecond
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  await Promise.all(promises);

  // Write final report
  const reportPath = config.term
    ? path.join(__dirname, 'downloads', termSlug(config.term), 'scrape_report.json')
    : path.join(__dirname, 'scrape_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  console.log(`\n==================================================`);
  console.log(`🎉 ALL MAJORS PROCESSED!`);
  console.log(`==================================================`);
  console.log(`✅ Majors with courses: ${summary.successfulWithCourses.length}`);
  console.log(`ℹ️ Majors without courses: ${summary.successfulEmpty.length}`);
  console.log(`❌ Failed majors: ${summary.failed.length}`);
  console.log(`Detailed report saved to: ${reportPath}\n`);

  if (summary.successfulWithCourses.length > 0) {
    console.log('Majors with courses details:');
    summary.successfulWithCourses.forEach(c => {
      console.log(`  - ${c.major}: ${c.count} courses`);
    });
  }
}

run();
