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

const OZU_EMAIL_RE = /^[a-z0-9._%+-]+@ozu\.edu\.tr$/i;

export function normalizeOzuEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && OZU_EMAIL_RE.test(email) ? email : null;
}
