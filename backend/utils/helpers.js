import { createHash, randomBytes } from 'crypto';

export function formatCourseCode(code) {
  const m = code.match(/^([A-Z]+)(\d+.*)$/i);
  return m ? `${m[1]} ${m[2]}` : code;
}

export function parseSchedule(raw) {
  if (!raw) return [];
  const times = [];
  const parts = raw.split(/[+\n\r]+/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^\s*([A-Za-zÇŞĞÖÜıİöüçşğ]+)\s*\|\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/);
    if (m) {
      times.push({ day: m[1].trim(), start: m[2].trim(), end: m[3].trim() });
    }
  }
  return times;
}

const SHARE_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function createShareId(length = 8) {
  const bytes = randomBytes(length);
  return Array.from(bytes, byte => SHARE_ID_ALPHABET[byte % SHARE_ID_ALPHABET.length]).join('');
}

export function normalizeSharedSchedule(raw) {
  const lessons = Array.isArray(raw?.lessons) ? raw.lessons.slice(0, 50) : [];
  const normalized = [];

  for (const lesson of lessons) {
    const code = String(lesson?.code || '').trim().slice(0, 20);
    const section = String(lesson?.section || '').trim().slice(0, 40);
    if (!code || !section) continue;

    const times = (Array.isArray(lesson.times) ? lesson.times : []).slice(0, 10).flatMap(time => {
      const day = String(time?.day || '').trim().slice(0, 20);
      const start = String(time?.start || '').trim();
      const end = String(time?.end || '').trim();
      if (!day || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) return [];
      return [{ day, start, end }];
    });

    const credits = Number(lesson?.credits);
    normalized.push({
      code,
      name: String(lesson?.name || code).trim().slice(0, 200),
      section,
      lecturer: String(lesson?.lecturer || 'Staff').trim().slice(0, 200),
      credits: Number.isFinite(credits) && credits >= 0 && credits <= 100 ? credits : 0,
      times,
    });
  }

  if (normalized.length === 0) return null;
  return {
    lessons: normalized,
    totalCredits: normalized.reduce((sum, lesson) => sum + lesson.credits, 0),
  };
}

export function sharedScheduleFingerprint(schedule, major = null, term = '') {
  const lessons = schedule.lessons.map(lesson => ({
    ...lesson,
    times: [...lesson.times].sort((left, right) =>
      left.day.localeCompare(right.day) || left.start.localeCompare(right.start) || left.end.localeCompare(right.end)
    ),
  })).sort((left, right) =>
    left.code.localeCompare(right.code)
      || left.section.localeCompare(right.section)
      || left.lecturer.localeCompare(right.lecturer)
      || left.name.localeCompare(right.name)
  );
  return createHash('sha256').update(JSON.stringify({
    major: major || null,
    term,
    schedule: { lessons, totalCredits: schedule.totalCredits },
  })).digest('hex');
}

export function escapeSvg(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function minutesFromTime(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

const CALENDAR_FIRST_DATE = {
  Pazartesi: '20260921',
  Salı: '20260922',
  Çarşamba: '20260923',
  Perşembe: '20260924',
  Cuma: '20260925',
};

function escapeIcs(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function foldIcsLine(line) {
  const chunks = [];
  let rest = String(line);
  while (rest.length > 70) {
    chunks.push(rest.slice(0, 70));
    rest = ` ${rest.slice(70)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

export function scheduleCalendarIcs(schedule, language = 'tr') {
  const tr = language === 'tr';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UniPlanners//Course Schedule//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${tr ? 'UniPlanners Ders Programı' : 'UniPlanners Course Schedule'}`,
    'X-WR-TIMEZONE:Europe/Istanbul',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Istanbul',
    'X-LIC-LOCATION:Europe/Istanbul',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0300',
    'TZNAME:+03',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  schedule.lessons.forEach((lesson, lessonIndex) => {
    (lesson.times || []).forEach((time, timeIndex) => {
      const firstDate = CALENDAR_FIRST_DATE[time.day];
      if (!firstDate) return;
      const start = String(time.start).replace(':', '');
      const end = String(time.end).replace(':', '');
      const sectionShort = lesson.section.replace(lesson.code, '').trim() || lesson.section;
      const description = [lesson.name, lesson.lecturer && `${tr ? 'Öğretim elemanı' : 'Instructor'}: ${lesson.lecturer}`]
        .filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${Date.now()}-${lessonIndex}-${timeIndex}-${randomBytes(4).toString('hex')}@uniplanner.org`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Istanbul:${firstDate}T${start}00`,
        `DTEND;TZID=Europe/Istanbul:${firstDate}T${end}00`,
        'RRULE:FREQ=WEEKLY;UNTIL=20270106T205959Z',
        `SUMMARY:${escapeIcs(`${lesson.code} · ${sectionShort}`)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
      );
    });
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

const SCHEDULE_COLORS = [
  '#2563eb', '#16a34a', '#7c3aed', '#db2777',
  '#d97706', '#0891b2', '#dc2626', '#4f46e5',
  '#0f766e', '#ea580c', '#c026d3', '#65a30d',
  '#0284c7', '#059669', '#be123c', '#9333ea',
];

function scheduleAgendaImageSvg(schedule, language = 'tr') {
  const tr = language === 'tr';
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
  const dayLabels = tr
    ? { Pazartesi: 'Pazartesi', Salı: 'Salı', Çarşamba: 'Çarşamba', Perşembe: 'Perşembe', Cuma: 'Cuma' }
    : { Pazartesi: 'Monday', Salı: 'Tuesday', Çarşamba: 'Wednesday', Perşembe: 'Thursday', Cuma: 'Friday' };
  const width = 900;
  const scale = 3;
  const padding = 42;
  const titleHeight = 104;
  const dayHeaderHeight = 54;
  const lessonHeight = 78;
  const dayGap = 18;
  const courseColor = new Map(schedule.lessons.map((lesson, index) => [lesson.code, SCHEDULE_COLORS[index % SCHEDULE_COLORS.length]]));
  const groups = days.map(day => ({
    day,
    lessons: schedule.lessons.flatMap(lesson => (lesson.times || [])
      .filter(time => time.day === day)
      .map(time => ({ ...lesson, time })))
      .sort((a, b) => a.time.start.localeCompare(b.time.start)),
  })).filter(group => group.lessons.length > 0);
  const contentHeight = groups.reduce((sum, group) => sum + dayHeaderHeight + group.lessons.length * lessonHeight + dayGap, 0);
  const height = titleHeight + contentHeight + padding;
  const lines = [];

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">`);
  lines.push('<rect width="100%" height="100%" fill="#f7f7f9"/>');
  lines.push(`<style>text{font-family:Arial,Helvetica,sans-serif}.muted{fill:#71717a}.mono{font-family:'Courier New',monospace}</style>`);
  lines.push(`<text x="${padding}" y="54" fill="#18181b" font-size="32" font-weight="700">${tr ? 'Ders Programı' : 'Course Schedule'}</text>`);
  lines.push(`<text x="${padding}" y="82" class="muted" font-size="17" font-weight="600">${schedule.lessons.length} ${tr ? 'ders' : 'courses'} · ${escapeSvg(schedule.totalCredits)} ${tr ? 'AKTS' : 'ECTS'}</text>`);

  let y = titleHeight;
  for (const group of groups) {
    const cardHeight = dayHeaderHeight + group.lessons.length * lessonHeight;
    lines.push(`<rect x="${padding}" y="${y}" width="${width - padding * 2}" height="${cardHeight}" rx="15" fill="#ffffff" stroke="#d8dce5" stroke-width="1.5"/>`);
    lines.push(`<rect x="${padding}" y="${y}" width="${width - padding * 2}" height="${dayHeaderHeight}" rx="15" fill="#eeecff"/>`);
    lines.push(`<rect x="${padding}" y="${y + 28}" width="${width - padding * 2}" height="${dayHeaderHeight - 28}" fill="#eeecff"/>`);
    lines.push(`<text x="${padding + 20}" y="${y + 35}" fill="#5144cc" font-size="21" font-weight="700">${dayLabels[group.day]}</text>`);
    lines.push(`<text x="${width - padding - 20}" y="${y + 35}" fill="#6f7787" font-size="15" font-weight="600" text-anchor="end">${group.lessons.length} ${tr ? 'ders' : 'courses'}</text>`);

    group.lessons.forEach((lesson, index) => {
      const rowY = y + dayHeaderHeight + index * lessonHeight;
      const color = courseColor.get(lesson.code) || SCHEDULE_COLORS[0];
      const sectionShort = lesson.section.replace(lesson.code, '').trim() || lesson.section;
      if (index > 0) lines.push(`<line x1="${padding + 20}" y1="${rowY}" x2="${width - padding - 20}" y2="${rowY}" stroke="#eceef2"/>`);
      lines.push(`<text x="${padding + 20}" y="${rowY + 31}" fill="#18181b" class="mono" font-size="22" font-weight="700">${escapeSvg(lesson.time.start)}</text>`);
      lines.push(`<text x="${padding + 20}" y="${rowY + 55}" class="muted mono" font-size="16">${escapeSvg(lesson.time.end)}</text>`);
      lines.push(`<rect x="${padding + 140}" y="${rowY + 17}" width="5" height="44" rx="2.5" fill="${color}"/>`);
      lines.push(`<text x="${padding + 168}" y="${rowY + 34}" fill="#18181b" class="mono" font-size="24" font-weight="700">${escapeSvg(lesson.code)}</text>`);
      lines.push(`<text x="${padding + 168}" y="${rowY + 58}" class="muted" font-size="17" font-weight="600">${escapeSvg(sectionShort)}</text>`);
    });
    y += cardHeight + dayGap;
  }

  lines.push('</svg>');
  return lines.join('');
}

export function scheduleImageSvg(schedule, language = 'tr', layout = 'grid') {
  if (layout === 'agenda') return scheduleAgendaImageSvg(schedule, language);
  const tr = language === 'tr';
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
  const dayLabels = tr ? ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const width = 1400;
  const padding = 48;
  const gridTop = 112;
  const gridLeft = padding;
  const timeWidth = 80;
  const dayWidth = (width - padding * 2 - timeWidth) / 5;
  const rowHeight = 48;
  const headerHeight = 48;
  const slotRows = 12;
  const gridHeight = headerHeight + rowHeight * slotRows;
  const gridWidth = timeWidth + dayWidth * 5;
  const height = gridTop + gridHeight + padding;
  const exportScale = 3;
  const baseMinutes = 8 * 60 + 40;

  const courseColor = new Map(schedule.lessons.map((lesson, index) => [lesson.code, SCHEDULE_COLORS[index % SCHEDULE_COLORS.length]]));
  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * exportScale}" height="${height * exportScale}" viewBox="0 0 ${width} ${height}">`);
  lines.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  lines.push(`<style>text{font-family:Arial,Helvetica,sans-serif}.muted{fill:#71717a}.mono{font-family:'Courier New',monospace}</style>`);
  lines.push(`<text x="${padding}" y="68" fill="#18181b" font-size="30" font-weight="700">${tr ? 'Ders Programı' : 'Course Schedule'}</text>`);
  lines.push(`<text x="${width - padding}" y="68" class="muted" font-size="16" text-anchor="end">${schedule.lessons.length} ${tr ? 'ders' : 'courses'} · ${escapeSvg(schedule.totalCredits)} ${tr ? 'AKTS' : 'ECTS'}</text>`);

  lines.push(`<rect x="${gridLeft}" y="${gridTop}" width="${gridWidth}" height="${gridHeight}" rx="10" fill="#ffffff" stroke="#e4e4e7"/>`);
  lines.push(`<rect x="${gridLeft}" y="${gridTop}" width="${gridWidth}" height="${headerHeight}" rx="10" fill="#f4f4f5"/>`);
  lines.push(`<rect x="${gridLeft}" y="${gridTop + 24}" width="${gridWidth}" height="24" fill="#f4f4f5"/>`);
  dayLabels.forEach((day, index) => {
    const x = gridLeft + timeWidth + dayWidth * index;
    lines.push(`<line x1="${x}" y1="${gridTop}" x2="${x}" y2="${gridTop + gridHeight}" stroke="#e4e4e7"/>`);
    lines.push(`<text x="${x + dayWidth / 2}" y="${gridTop + 31}" fill="#71717a" font-size="14" font-weight="700" text-anchor="middle">${day}</text>`);
  });
  for (let row = 0; row <= slotRows; row += 1) {
    const y = gridTop + headerHeight + rowHeight * row;
    lines.push(`<line x1="${gridLeft}" y1="${y}" x2="${gridLeft + gridWidth}" y2="${y}" stroke="#e4e4e7"/>`);
    if (row === slotRows) continue;
    const minutes = baseMinutes + row * 60;
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    lines.push(`<text x="${gridLeft + timeWidth - 12}" y="${y + 29}" class="muted mono" font-size="12" text-anchor="end">${hour}:${minute}</text>`);
  }

  for (const lesson of schedule.lessons) {
    for (const time of lesson.times || []) {
      const dayIndex = days.indexOf(time.day);
      const start = minutesFromTime(time.start);
      const end = minutesFromTime(time.end);
      if (dayIndex < 0 || start == null || end == null) continue;
      const x = gridLeft + timeWidth + dayWidth * dayIndex + 3;
      const y = gridTop + headerHeight + ((start - baseMinutes) / 60) * rowHeight + 3;
      const blockHeight = Math.max(36, ((end - start) / 60) * rowHeight - 6);
      const color = courseColor.get(lesson.code);
      const sectionShort = lesson.section.replace(lesson.code, '').trim() || lesson.section;
      lines.push(`<rect x="${x}" y="${y}" width="${dayWidth - 6}" height="${blockHeight}" rx="5" fill="${color}" fill-opacity="0.12"/>`);
      lines.push(`<rect x="${x}" y="${y}" width="4" height="${blockHeight}" rx="2" fill="${color}"/>`);
      lines.push(`<text x="${x + 13}" y="${y + 21}" fill="#18181b" class="mono" font-size="14" font-weight="700">${escapeSvg(lesson.code)}</text>`);
      lines.push(`<text x="${x + 13}" y="${y + 40}" fill="#71717a" font-size="12">${escapeSvg(sectionShort)}</text>`);
    }
  }

  lines.push('</svg>');
  return lines.join('');
}

const OZU_EMAIL_RE = /^[a-z0-9._%+-]+@ozu\.edu\.tr$/i;

export function normalizeOzuEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && OZU_EMAIL_RE.test(email) ? email : null;
}
