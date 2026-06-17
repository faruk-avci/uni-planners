import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const xlsPath = path.join(__dirname, 'courseCatalogDS_tmp_CN8466617512072214216.xls');

console.log('Reading XLS file...');
const workbook = XLSX.readFile(xlsPath);

console.log('Sheet Names:', workbook.SheetNames);

const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];

// Parse as JSON array of arrays
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
console.log(`Total rows found: ${rows.length}`);

if (rows.length > 0) {
  console.log('Header Row (Row 0):', rows[0]);
  console.log('First Data Row (Row 1):', rows[1]);
  console.log('Second Data Row (Row 2):', rows[2]);
}
