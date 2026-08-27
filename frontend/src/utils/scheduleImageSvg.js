// Ported verbatim from backend/utils/helpers.js so schedule PNG export can
// run entirely client-side: the exported image is built from this fixed-size
// SVG (not a screenshot of the visible page), so it looks the same whether
// the user is on a wide desktop layout or a narrow mobile one.

const SCHEDULE_COLORS = [
  '#2563eb', '#16a34a', '#7c3aed', '#db2777',
  '#d97706', '#0891b2', '#dc2626', '#4f46e5',
  '#0f766e', '#ea580c', '#c026d3', '#65a30d',
  '#0284c7', '#059669', '#be123c', '#9333ea',
]

function escapeSvg(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function minutesFromTime(value) {
  const [hour, minute] = String(value || '').split(':').map(Number)
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null
}

function scheduleAgendaImageSvg(schedule, language = 'tr') {
  const tr = language === 'tr'
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']
  const dayLabels = tr
    ? { Pazartesi: 'Pazartesi', Salı: 'Salı', Çarşamba: 'Çarşamba', Perşembe: 'Perşembe', Cuma: 'Cuma' }
    : { Pazartesi: 'Monday', Salı: 'Tuesday', Çarşamba: 'Wednesday', Perşembe: 'Thursday', Cuma: 'Friday' }
  const width = 900
  const scale = 3
  const padding = 42
  const titleHeight = 104
  const dayHeaderHeight = 54
  const lessonHeight = 78
  const dayGap = 18
  const courseColor = new Map(schedule.lessons.map((lesson, index) => [lesson.code, SCHEDULE_COLORS[index % SCHEDULE_COLORS.length]]))
  const groups = days.map(day => ({
    day,
    lessons: schedule.lessons.flatMap(lesson => (lesson.times || [])
      .filter(time => time.day === day)
      .map(time => ({ ...lesson, time })))
      .sort((a, b) => a.time.start.localeCompare(b.time.start)),
  })).filter(group => group.lessons.length > 0)
  const contentHeight = groups.reduce((sum, group) => sum + dayHeaderHeight + group.lessons.length * lessonHeight + dayGap, 0)
  const height = titleHeight + contentHeight + padding
  const lines = []

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">`)
  // Same page background as the grid layout's export (#ffffff) -- these two
  // used to differ, so switching layout before exporting changed the PNG's
  // background color for no reason.
  lines.push('<rect width="100%" height="100%" fill="#ffffff"/>')
  lines.push(`<style>text{font-family:Arial,Helvetica,sans-serif}.muted{fill:#71717a}.mono{font-family:'Courier New',monospace}</style>`)
  lines.push(`<text x="${padding}" y="54" fill="#18181b" font-size="32" font-weight="700">${tr ? 'Ders Programı' : 'Course Schedule'}</text>`)
  lines.push(`<text x="${padding}" y="82" class="muted" font-size="17" font-weight="600">${schedule.lessons.length} ${tr ? 'ders' : 'courses'} · ${escapeSvg(schedule.totalCredits)} ${tr ? 'AKTS' : 'ECTS'}</text>`)

  let y = titleHeight
  for (const group of groups) {
    const cardHeight = dayHeaderHeight + group.lessons.length * lessonHeight
    lines.push(`<rect x="${padding}" y="${y}" width="${width - padding * 2}" height="${cardHeight}" rx="15" fill="#ffffff" stroke="#d8dce5" stroke-width="1.5"/>`)
    lines.push(`<rect x="${padding}" y="${y}" width="${width - padding * 2}" height="${dayHeaderHeight}" rx="15" fill="#eeecff"/>`)
    lines.push(`<rect x="${padding}" y="${y + 28}" width="${width - padding * 2}" height="${dayHeaderHeight - 28}" fill="#eeecff"/>`)
    lines.push(`<text x="${padding + 20}" y="${y + 35}" fill="#5144cc" font-size="21" font-weight="700">${dayLabels[group.day]}</text>`)
    lines.push(`<text x="${width - padding - 20}" y="${y + 35}" fill="#6f7787" font-size="15" font-weight="600" text-anchor="end">${group.lessons.length} ${tr ? 'ders' : 'courses'}</text>`)

    group.lessons.forEach((lesson, index) => {
      const rowY = y + dayHeaderHeight + index * lessonHeight
      const color = courseColor.get(lesson.code) || SCHEDULE_COLORS[0]
      const sectionShort = lesson.section.replace(lesson.code, '').trim() || lesson.section
      if (index > 0) lines.push(`<line x1="${padding + 20}" y1="${rowY}" x2="${width - padding - 20}" y2="${rowY}" stroke="#eceef2"/>`)
      lines.push(`<text x="${padding + 20}" y="${rowY + 31}" fill="#18181b" class="mono" font-size="22" font-weight="700">${escapeSvg(lesson.time.start)}</text>`)
      lines.push(`<text x="${padding + 20}" y="${rowY + 55}" class="muted mono" font-size="16">${escapeSvg(lesson.time.end)}</text>`)
      lines.push(`<rect x="${padding + 140}" y="${rowY + 17}" width="5" height="44" rx="2.5" fill="${color}"/>`)
      lines.push(`<text x="${padding + 168}" y="${rowY + 34}" fill="#18181b" class="mono" font-size="24" font-weight="700">${escapeSvg(lesson.code)}</text>`)
      lines.push(`<text x="${padding + 168}" y="${rowY + 58}" class="muted" font-size="17" font-weight="600">${escapeSvg(sectionShort)}</text>`)
    })
    y += cardHeight + dayGap
  }

  lines.push('</svg>')
  return lines.join('')
}

export function scheduleImageSvg(schedule, language = 'tr', layout = 'grid') {
  if (layout === 'agenda') return scheduleAgendaImageSvg(schedule, language)
  const tr = language === 'tr'
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']
  const dayLabels = tr ? ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const width = 1400
  const padding = 48
  const gridTop = 112
  const gridLeft = padding
  const timeWidth = 80
  const dayWidth = (width - padding * 2 - timeWidth) / 5
  const rowHeight = 48
  const headerHeight = 48
  const slotRows = 12
  const gridHeight = headerHeight + rowHeight * slotRows
  const gridWidth = timeWidth + dayWidth * 5
  const height = gridTop + gridHeight + padding
  const exportScale = 3
  const baseMinutes = 8 * 60 + 40

  const courseColor = new Map(schedule.lessons.map((lesson, index) => [lesson.code, SCHEDULE_COLORS[index % SCHEDULE_COLORS.length]]))
  const lines = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width * exportScale}" height="${height * exportScale}" viewBox="0 0 ${width} ${height}">`)
  lines.push(`<rect width="100%" height="100%" fill="#ffffff"/>`)
  lines.push(`<style>text{font-family:Arial,Helvetica,sans-serif}.muted{fill:#71717a}.mono{font-family:'Courier New',monospace}</style>`)
  lines.push(`<text x="${padding}" y="68" fill="#18181b" font-size="30" font-weight="700">${tr ? 'Ders Programı' : 'Course Schedule'}</text>`)
  lines.push(`<text x="${width - padding}" y="68" class="muted" font-size="16" text-anchor="end">${schedule.lessons.length} ${tr ? 'ders' : 'courses'} · ${escapeSvg(schedule.totalCredits)} ${tr ? 'AKTS' : 'ECTS'}</text>`)

  lines.push(`<rect x="${gridLeft}" y="${gridTop}" width="${gridWidth}" height="${gridHeight}" rx="10" fill="#ffffff" stroke="#e4e4e7"/>`)
  lines.push(`<rect x="${gridLeft}" y="${gridTop}" width="${gridWidth}" height="${headerHeight}" rx="10" fill="#f4f4f5"/>`)
  lines.push(`<rect x="${gridLeft}" y="${gridTop + 24}" width="${gridWidth}" height="24" fill="#f4f4f5"/>`)
  dayLabels.forEach((day, index) => {
    const x = gridLeft + timeWidth + dayWidth * index
    lines.push(`<line x1="${x}" y1="${gridTop}" x2="${x}" y2="${gridTop + gridHeight}" stroke="#e4e4e7"/>`)
    lines.push(`<text x="${x + dayWidth / 2}" y="${gridTop + 31}" fill="#71717a" font-size="14" font-weight="700" text-anchor="middle">${day}</text>`)
  })
  for (let row = 0; row <= slotRows; row += 1) {
    const y = gridTop + headerHeight + rowHeight * row
    lines.push(`<line x1="${gridLeft}" y1="${y}" x2="${gridLeft + gridWidth}" y2="${y}" stroke="#e4e4e7"/>`)
    if (row === slotRows) continue
    const minutes = baseMinutes + row * 60
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
    const minute = String(minutes % 60).padStart(2, '0')
    lines.push(`<text x="${gridLeft + timeWidth - 12}" y="${y + 29}" class="muted mono" font-size="12" text-anchor="end">${hour}:${minute}</text>`)
  }

  for (const lesson of schedule.lessons) {
    for (const time of lesson.times || []) {
      const dayIndex = days.indexOf(time.day)
      const start = minutesFromTime(time.start)
      const end = minutesFromTime(time.end)
      if (dayIndex < 0 || start == null || end == null) continue
      const x = gridLeft + timeWidth + dayWidth * dayIndex + 3
      const y = gridTop + headerHeight + ((start - baseMinutes) / 60) * rowHeight + 3
      const blockHeight = Math.max(36, ((end - start) / 60) * rowHeight - 6)
      const color = courseColor.get(lesson.code)
      const sectionShort = lesson.section.replace(lesson.code, '').trim() || lesson.section
      lines.push(`<rect x="${x}" y="${y}" width="${dayWidth - 6}" height="${blockHeight}" rx="5" fill="${color}" fill-opacity="0.12"/>`)
      lines.push(`<rect x="${x}" y="${y}" width="4" height="${blockHeight}" rx="2" fill="${color}"/>`)
      lines.push(`<text x="${x + 13}" y="${y + 21}" fill="#18181b" class="mono" font-size="14" font-weight="700">${escapeSvg(lesson.code)}</text>`)
      lines.push(`<text x="${x + 13}" y="${y + 40}" fill="#71717a" font-size="12">${escapeSvg(sectionShort)}</text>`)
    }
  }

  lines.push('</svg>')
  return lines.join('')
}

// Rasterizes the SVG (already built at fixed, retina-scaled pixel dimensions
// regardless of the viewer's actual screen size) into a PNG Blob via canvas.
export function scheduleImagePng(schedule, language = 'tr', layout = 'grid') {
  const svg = scheduleImageSvg(schedule, language, layout)
  const widthMatch = svg.match(/width="(\d+)"/)
  const heightMatch = svg.match(/height="(\d+)"/)
  const width = widthMatch ? Number(widthMatch[1]) : 1400
  const height = heightMatch ? Number(heightMatch[1]) : 700

  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas could not produce a PNG blob'))
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Schedule SVG could not be rasterized'))
    }
    img.src = url
  })
}
