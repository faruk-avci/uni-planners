import { MAJOR_TO_CURRICULUM, curriculumData, electiveTypeMap, getCatalog } from './catalogService.js';

const normalize = code => String(code || '').replace(/\s+/g, '').toUpperCase();
const normalizeLabel = str => String(str || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const EPSILON = 0.01;

// The curriculum was restructured this year for some course sequences: the
// old two-course pair is now taught/required as a single merged course. A
// student must have taken BOTH old codes for the merged requirement to count
// as satisfied — taking only one half (e.g. HIST 201 without HIST 202) does
// not complete it. Not derived from any parsed data — this is institutional
// knowledge about the specific renumbering, not a per-student personalization,
// so it applies regardless of what's in the audit PDF.
const LEGACY_COURSE_MERGES = [
  { newCode: 'TLL100', oldCodes: ['TLL101', 'TLL102'] },
  { newCode: 'HIST200', oldCodes: ['HIST201', 'HIST202'] },
];

// Lower rank = filled first. Free/general electives are deliberately last since
// they're the most flexible catch-all and should mop up whatever's left over.
function priorityRank(key, label) {
  const text = `${key} ${label}`.toLocaleLowerCase('tr-TR');
  if (text.includes('sertifika') || text.includes('certificate')) return 0;
  if (text.includes('özel') || text.includes('uzman') || text.includes('specialization')) return 1;
  if (text.includes('sosyal') || text.includes('social')) return 2;
  if (text.includes('dil') || text.includes('language')) return 3;
  if (text.includes('tasar') || text.includes('design')) return 4;
  if (text.includes('bitirme') || text.includes('finishing')) return 5;
  if (text.includes('program')) return 6;
  if (text.includes('serbest') || text === 'free' || text.includes(' free')) return 8;
  return 7; // unrecognized/other
}

function isFreeElectiveType(key, label) {
  const text = `${key} ${label}`.toLocaleLowerCase('tr-TR');
  return text.includes('serbest') || text === 'free' || text.includes(' free');
}

function findThreshold(label, areaThresholds) {
  const target = normalizeLabel(label);
  const exact = areaThresholds.find(a => normalizeLabel(a.label) === target);
  if (exact) return { credits: exact.credits, estimated: false };
  const fuzzy = areaThresholds.find(a => {
    const candidate = normalizeLabel(a.label);
    return candidate.includes(target) || target.includes(candidate);
  });
  if (fuzzy) return { credits: fuzzy.credits, estimated: false };
  return null;
}

function sumSlotCredits(curriculum, typeKey) {
  let total = 0;
  for (const terms of Object.values(curriculum.semesters || {})) {
    for (const list of Object.values(terms)) {
      for (const item of list) {
        if (!item.code && item.electiveType === typeKey) total += Number(item.credits) || 0;
      }
    }
  }
  return total;
}

export async function matchDegreeAudit({ degreeCode, areaThresholds, takenCourseCodes, substitutions = [] }) {
  const curriculumId = MAJOR_TO_CURRICULUM[degreeCode];
  if (!curriculumId) {
    return { error: `No curriculum is on file for major "${degreeCode}"`, major: degreeCode };
  }
  const curriculum = curriculumData(curriculumId);
  if (!curriculum) {
    return { error: `Curriculum data for "${curriculumId}" could not be loaded`, major: degreeCode };
  }
  const etMap = electiveTypeMap(curriculumId);
  const { byCode: catalogByCode } = await getCatalog();

  const requiredCodes = new Set();
  for (const terms of Object.values(curriculum.semesters || {})) {
    for (const list of Object.values(terms)) {
      for (const item of list) {
        if (item.code) requiredCodes.add(normalize(item.code));
      }
    }
  }

  const takenSet = new Set(takenCourseCodes.map(normalize));
  const requiredTaken = [];
  const requiredMissing = new Set(requiredCodes);
  const consumedBySubstitution = new Set();

  // The university may accept a course the student actually took as covering
  // a *different* required slot (e.g. CS 112 counted toward MATH 112). Applied
  // before ordinary code matching so the substituted-for course isn't also
  // left dangling in requiredMissing, and the student's real course isn't
  // separately (mis)reallocated as an elective.
  for (const { studentCourse, areaCourse } of substitutions) {
    const areaCode = normalize(areaCourse);
    if (!areaCode || !requiredCodes.has(areaCode)) continue;
    const studentCode = studentCourse ? normalize(studentCourse) : null;
    const satisfied = !studentCode || takenSet.has(studentCode);
    if (!satisfied) continue;
    requiredTaken.push({ code: areaCode, via: studentCode || undefined });
    requiredMissing.delete(areaCode);
    if (studentCode) consumedBySubstitution.add(studentCode);
  }

  for (const { newCode, oldCodes } of LEGACY_COURSE_MERGES) {
    if (!requiredCodes.has(newCode) || !requiredMissing.has(newCode)) continue;
    // The merge is a genuine combination of both halves, not an either/or
    // equivalency - taking only one part (e.g. HIST 201 without HIST 202)
    // does not satisfy the merged requirement.
    const allTaken = oldCodes.every(code => takenSet.has(code) && !consumedBySubstitution.has(code));
    if (!allTaken) continue;
    requiredTaken.push({ code: newCode, via: oldCodes.join('+') });
    requiredMissing.delete(newCode);
    for (const code of oldCodes) consumedBySubstitution.add(code);
  }

  const poolCodes = [];
  for (const rawCode of takenCourseCodes) {
    const code = normalize(rawCode);
    if (consumedBySubstitution.has(code)) continue;
    if (requiredCodes.has(code)) {
      requiredTaken.push({ code });
      requiredMissing.delete(code);
    } else {
      poolCodes.push(code);
    }
  }

  const electiveTypes = Object.entries(curriculum.electivePoolRefs || {}).map(([key]) => {
    const label = curriculum.electiveLabels?.[key] || key;
    const threshold = findThreshold(label, areaThresholds);
    const required = threshold ? threshold.credits : sumSlotCredits(curriculum, key);
    return {
      key,
      label,
      required,
      // The semester-plan template usually lists more slot instances of a type
      // than the degree actually requires (e.g. 6 program-elective slots worth
      // 36 credits when only 12 are needed) since students only have to pick
      // some of them. Cap allocation at that wider slot capacity rather than
      // the bare requirement, so a student who took more matching electives
      // than the minimum still gets them attributed here instead of being
      // bumped into a lower-priority type (or "couldn't be placed") just
      // because this type's strict minimum was already satisfied by others.
      slotCapacity: Math.max(sumSlotCredits(curriculum, key), required),
      estimated: !threshold,
      filled: 0,
      remaining: required,
      status: 'incomplete',
      courses: [],
      priority: priorityRank(key, label),
    };
  }).sort((a, b) => a.priority - b.priority);

  // Some courses eligible for an elective pool (e.g. specially-numbered
  // certificate electives) aren't in the live catalog_courses table at all —
  // falling back to null there previously forced them into "unplaced" with
  // 0 credits even when we already know which pool they belong to. The pool
  // file itself carries each course's own credit value, so use that first.
  const poolCreditsByCode = new Map();
  for (const list of Object.values(curriculum.electives || {})) {
    for (const c of list) {
      const code = normalize(c.code);
      if (code && !poolCreditsByCode.has(code)) poolCreditsByCode.set(code, Number(c.credits) || 0);
    }
  }

  // Free electives are conventionally open to almost any course. A taken
  // course that isn't curated into any specific pool file (a graduate-level
  // course, a PE course, anything the pool JSON files just don't happen to
  // list) should still count toward free-elective capacity instead of being
  // reported as unplaceable, as long as we actually know its credit value.
  const freeElectiveKey = Object.keys(curriculum.electivePoolRefs || {})
    .find(key => isFreeElectiveType(key, curriculum.electiveLabels?.[key] || key)) || null;

  const chunks = [];
  const unplaced = [];
  for (const code of poolCodes) {
    let eligibleTypes = etMap.get(code) || [];
    const credits = catalogByCode.get(code)?.credits ?? poolCreditsByCode.get(code) ?? null;
    if (eligibleTypes.length === 0 && credits !== null && freeElectiveKey) {
      eligibleTypes = [freeElectiveKey];
    }
    if (eligibleTypes.length === 0 || credits === null) {
      unplaced.push({ code, credits: credits ?? 0 });
      continue;
    }
    chunks.push({ code, creditsRemaining: credits, eligibleTypes });
  }

  function fillType(type, cap) {
    let remaining = cap - type.filled;
    while (remaining > EPSILON) {
      const candidates = chunks.filter(c => c.creditsRemaining > EPSILON && c.eligibleTypes.includes(type.key));
      if (candidates.length === 0) break;
      const waste = c => remaining - Math.min(c.creditsRemaining, remaining);
      const best = candidates.reduce((a, b) => (waste(b) < waste(a) ? b : a));
      const used = Math.min(best.creditsRemaining, remaining);
      type.courses.push({ code: best.code, creditsUsed: used });
      type.filled += used;
      best.creditsRemaining -= used;
      remaining -= used;
    }
  }

  // Pass 1: give every type a fair shot at its own real requirement first, in
  // priority order. Capping at `required` here (not the wider slot capacity)
  // stops an earlier-priority type like program-electives from greedily
  // absorbing every multi-eligible course before a later type (free electives)
  // ever gets a turn — that would leave the later type's own real requirement
  // unmet even though the student took plenty of qualifying coursework overall.
  for (const type of electiveTypes) {
    fillType(type, type.required);
    type.remaining = Math.max(type.required - type.filled, 0);
    type.status = type.remaining <= EPSILON ? 'complete' : 'incomplete';
  }

  // Pass 2: every type has now had its fair shot. Whatever's genuinely left
  // over (a student took more matching electives than the minimum) can spill
  // into the wider template slot capacity of higher-priority types instead of
  // being reported as unplaceable, without having robbed a lower-priority
  // type's own requirement to get there.
  for (const type of electiveTypes) {
    fillType(type, type.slotCapacity);
    delete type.priority;
    delete type.slotCapacity;
  }

  for (const chunk of chunks) {
    if (chunk.creditsRemaining > EPSILON) unplaced.push({ code: chunk.code, credits: chunk.creditsRemaining });
  }

  return {
    major: degreeCode,
    curriculumId,
    requiredTaken,
    requiredMissing: [...requiredMissing].map(code => ({ code })),
    electiveTypes,
    unplaced,
  };
}
