/**
 * Schedule generation engine.
 *
 * Algorithm ported from ozu-planner-v1 (bitmask conflict detection +
 * backtracking over section combinations), adapted to v2's data model where
 * each section already carries parsed `times: [{ day, start, end }]`.
 *
 * New in v2: free-day pruning — sections that meet on a user-selected free day
 * are dropped before generation, so no produced schedule uses those days.
 */

// Full Turkish weekday names -> Mon..Fri column index. Weekend/other days are
// intentionally unmapped (the grid is Mon-Fri only), matching v1 behaviour.
const DAY_INDEX = {
  'Pazartesi': 0,
  'Salı': 1,
  'Çarşamba': 2,
  'Perşembe': 3,
  'Cuma': 4,
};

// Hourly granularity, base 08:00 -> bit 0. "12:40" -> hour 12 -> index 4.
// Minutes are ignored on purpose (same coarse hourly bitmask as v1), which is
// safe because campus slots are >=1h apart and never share an hour boundary.
function timeToIndex(timeString) {
  const hour = parseInt(String(timeString).split(':')[0], 10);
  return hour - 8;
}

const MAX_BITS = 16; // 08:00 .. 23:00

/**
 * Build a 5-int day mask for a section from its parsed time slots.
 * Bit h on day d means the section occupies the hour starting at 08:00 + h.
 */
function buildMask(times) {
  const mask = [0, 0, 0, 0, 0];
  for (const t of times || []) {
    const day = DAY_INDEX[t.day];
    if (day === undefined) continue; // weekend / unknown -> off-grid
    const startIdx = timeToIndex(t.start);
    const endIdx = timeToIndex(t.end);
    for (let h = startIdx; h < endIdx; h++) {
      if (h >= 0 && h < MAX_BITS) mask[day] |= (1 << h);
    }
  }
  return mask;
}

function masksConflict(a, b) {
  for (let d = 0; d < 5; d++) {
    if ((a[d] & b[d]) !== 0) return true;
  }
  return false;
}

/**
 * Drop sections that meet on any free day. Returns a new per-course map.
 * `freeDayIdxs` is a Set of 0..4 column indices.
 */
function applyFreeDays(coursesSections, freeDayIdxs) {
  if (!freeDayIdxs || freeDayIdxs.size === 0) return coursesSections;
  const out = {};
  for (const [code, sections] of Object.entries(coursesSections)) {
    out[code] = sections.filter(s => {
      for (const d of freeDayIdxs) {
        if (s.mask[d] !== 0) return false;
      }
      return true;
    });
  }
  return out;
}

/**
 * Backtracking search over one section per course, pruning on mask conflict.
 * Returns arrays of chosen sections. Capped to avoid runaway output.
 */
function generateCombinations(coursesSections, cap = 10000) {
  const codes = Object.keys(coursesSections);
  const results = [];
  const acc = [0, 0, 0, 0, 0];
  const chosen = [];

  function backtrack(i) {
    if (results.length >= cap) return;
    if (i === codes.length) {
      results.push([...chosen]);
      return;
    }
    for (const section of coursesSections[codes[i]]) {
      if (results.length >= cap) return;
      if (masksConflict(acc, section.mask)) continue;
      for (let d = 0; d < 5; d++) acc[d] |= section.mask[d];
      chosen.push(section);
      backtrack(i + 1);
      chosen.pop();
      for (let d = 0; d < 5; d++) acc[d] ^= section.mask[d];
    }
  }

  backtrack(0);
  return results;
}

/**
 * Preference score for a set of sections.
 * morning: rewards early slots; evening: rewards late slots; balanced: 0.
 */
function scoreSchedule(sections, preference) {
  if (preference !== 'morning' && preference !== 'evening') return 0;
  let score = 0;
  for (const section of sections) {
    for (let d = 0; d < 5; d++) {
      const mask = section.mask[d];
      if (!mask) continue;
      for (let h = 0; h < MAX_BITS; h++) {
        if ((mask & (1 << h)) === 0) continue;
        if (preference === 'morning' && h < 5) score += (6 - h);
        else if (preference === 'evening' && h >= 5) score += (h - 4);
      }
    }
  }
  return score;
}

function clockMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function sectionOverlapTimes(sectionA, sectionB) {
  const overlaps = [];
  for (const timeA of sectionA.times || []) {
    for (const timeB of sectionB.times || []) {
      if (timeA.day !== timeB.day) continue;
      const startA = clockMinutes(timeA.start);
      const endA = clockMinutes(timeA.end);
      const startB = clockMinutes(timeB.start);
      const endB = clockMinutes(timeB.end);
      if ([startA, endA, startB, endB].some(value => value === null)) continue;
      const start = Math.max(startA, startB);
      const end = Math.min(endA, endB);
      if (start >= end) continue;
      const format = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      overlaps.push({ day: timeA.day, start: format(start), end: format(end) });
    }
  }
  return overlaps;
}

/**
 * Explain why a basket is unsatisfiable without guessing. A hard-conflict
 * pair means every available section of course A overlaps every available
 * section of course B. Removal options are verified by the same generator.
 */
function diagnoseScheduleConflicts(coursesSections) {
  const entries = Object.entries(coursesSections).filter(([, sections]) => sections.length > 0);
  const hardConflicts = [];

  for (let i = 0; i < entries.length; i++) {
    const [courseA, sectionsA] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [courseB, sectionsB] = entries[j];
      let compatible = false;
      const overlapTimes = [];
      for (const sectionA of sectionsA) {
        for (const sectionB of sectionsB) {
          if (!masksConflict(sectionA.mask, sectionB.mask)) {
            compatible = true;
            break;
          }
          overlapTimes.push(...sectionOverlapTimes(sectionA, sectionB));
        }
        if (compatible) break;
      }
      if (!compatible) {
        hardConflicts.push({
          courseA,
          courseB,
          sectionsA: [...new Set(sectionsA.map(section => section.section))],
          sectionsB: [...new Set(sectionsB.map(section => section.section))],
          overlaps: [...new Map(overlapTimes.map(time => [`${time.day}|${time.start}|${time.end}`, time])).values()].slice(0, 6),
        });
      }
    }
  }

  const codes = entries.map(([code]) => code);
  const without = removed => Object.fromEntries(entries.filter(([code]) => !removed.has(code)));
  const removalOptions = [];
  const hardConflictCourses = [...new Set(hardConflicts.flatMap(pair => [pair.courseA, pair.courseB]))];
  const singleCandidates = codes.length <= 12 ? codes : hardConflictCourses.slice(0, 10);

  for (const code of singleCandidates) {
    if (generateCombinations(without(new Set([code])), 1).length > 0) {
      removalOptions.push({ courses: [code] });
    }
  }

  // Some unsatisfiable baskets need two removals. Keep this exact search
  // bounded so diagnostics cannot dominate a large generation request.
  if (removalOptions.length === 0 && codes.length <= 10) {
    for (let i = 0; i < codes.length && removalOptions.length < 6; i++) {
      for (let j = i + 1; j < codes.length && removalOptions.length < 6; j++) {
        const removed = new Set([codes[i], codes[j]]);
        if (generateCombinations(without(removed), 1).length > 0) {
          removalOptions.push({ courses: [codes[i], codes[j]] });
        }
      }
    }
  }

  return {
    analyzedCourseCount: codes.length,
    hardConflicts: hardConflicts.slice(0, 8),
    removalOptions: removalOptions.slice(0, 8),
    multiCourseInteraction: hardConflicts.length === 0,
  };
}

function freeDayIndexesForSections(sections) {
  const occupied = [0, 0, 0, 0, 0];
  for (const section of sections) {
    for (let d = 0; d < 5; d++) occupied[d] |= section.mask[d];
  }
  return occupied.flatMap((mask, index) => mask === 0 ? [index] : []);
}

/**
 * Main entry point.
 *
 * @param {Object} coursesSections  { [code]: [{ code, name, section, lecturer, credits, times, mask }] }
 * @param {Object} opts  { freeDayIdxs:Set<number>, preference, limit }
 * @returns { schedules, totalGenerated, limited, emptyCourses }
 */
function generateSchedules(coursesSections, { freeDayIdxs, preference = 'balanced', limit = 120 } = {}) {
  const pruned = applyFreeDays(coursesSections, freeDayIdxs);

  // A course with zero remaining sections makes any schedule impossible.
  const emptyCourses = Object.entries(pruned)
    .filter(([, secs]) => secs.length === 0)
    .map(([code]) => code);
  if (emptyCourses.length > 0) {
    return { schedules: [], totalGenerated: 0, limited: false, emptyCourses, availableFreeDayIndexes: [] };
  }

  let combos = generateCombinations(pruned);

  if (preference === 'morning' || preference === 'evening') {
    combos.sort((a, b) => scoreSchedule(b, preference) - scoreSchedule(a, preference));
  }

  const availableFreeDayIndexes = [...new Set(combos.flatMap(freeDayIndexesForSections))].sort((a, b) => a - b);

  const totalGenerated = combos.length;
  const diagnostics = totalGenerated === 0 ? diagnoseScheduleConflicts(pruned) : null;
  const limited = totalGenerated > limit;
  const sliced = combos.slice(0, limit);

  const schedules = sliced.map(sections => {
    const lessons = sections.map(s => ({
      code: s.code,
      name: s.name,
      section: s.section,
      lecturer: s.lecturer,
      credits: s.credits,
      times: s.times,
    }));
    const totalCredits = lessons.reduce((sum, l) => sum + (l.credits || 0), 0);
    return { lessons, totalCredits, freeDayIndexes: freeDayIndexesForSections(sections) };
  });

  return { schedules, totalGenerated, limited, emptyCourses: [], availableFreeDayIndexes, diagnostics };
}

export {
  DAY_INDEX,
  buildMask,
  generateSchedules,
  scoreSchedule,
  applyFreeDays,
  freeDayIndexesForSections,
  diagnoseScheduleConflicts,
};
