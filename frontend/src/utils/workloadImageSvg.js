// Same approach as scheduleImageSvg.js: a fixed-size SVG built from data (not
// a screenshot of the live, horizontally-scrollable table), rasterized to PNG
// via canvas. Looks the same whether it's exported from a wide desktop layout
// or a narrow mobile one.
import { COURSE_COLORS } from './courseColors'

function escapeSvg(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

// SVG text doesn't wrap on its own, so long labels get a crude
// estimated-width ellipsis instead of overflowing into the next segment.
function truncate(text, maxWidth, fontSize) {
  const value = String(text || '')
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.56)))
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`
}

// Greedy word-wrap into up to maxLines lines (same width estimate as
// truncate()), so a narrow segment reads "Attendance/ Interaction" across two
// lines instead of chopping it down to "Atte…".
function wrapText(text, maxWidth, fontSize, maxLines = 2) {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.56)))
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || candidate.length <= maxChars) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  const overflowing = lines.length > maxLines
  const visible = overflowing ? lines.slice(0, maxLines) : lines
  return visible.map((line, index) => {
    const forceTruncate = overflowing && index === visible.length - 1
    if (forceTruncate || line.length > maxChars) {
      return `${line.slice(0, Math.max(1, maxChars - 1))}…`
    }
    return line
  })
}

function cardShadowDefs() {
  return '<defs><filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#18181b" flood-opacity=".12"/></filter></defs>'
}

const CATEGORIES = ['final', 'midterm', 'quiz', 'homework', 'project', 'lab', 'attendance', 'other']

function workloadItemsFor(assessments, category) {
  if (!assessments || assessments.length === 0) return []
  return assessments.filter(a => {
    const matchCategory = category === 'other'
      ? ['other', 'presentation', 'report'].includes(a.category)
      : a.category === category
    return matchCategory && a.weight !== null && a.weight !== undefined
  })
}

export function workloadImageSvg(basket, language = 'tr') {
  const tr = language === 'tr'
  const width = 900
  const padding = 42
  const titleHeight = 104
  const courseColW = 190
  const totalColW = 84
  const rowHeight = 96
  const rowGap = 14
  const barLeft = padding + courseColW
  const barRight = width - padding - totalColW
  const barWidth = barRight - barLeft
  const cardMargin = 28
  const scale = 3
  const noDataText = tr ? 'Syllabus henüz yayınlanmadı' : 'Syllabus not published yet'

  const rows = (basket || []).map(course => {
    const hasAssessments = Boolean(course.assessments && course.assessments.length > 0)
    const reviewNote = hasAssessments && course.assessments.every(a => a.weight === null || a.weight === undefined)
      ? course.assessments.map(a => a.type).filter(Boolean).join('; ')
      : null
    const items = hasAssessments && !reviewNote
      ? CATEGORIES.flatMap(cat => workloadItemsFor(course.assessments, cat))
      : []
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0)
    return { course, items, reviewNote, hasAssessments, totalWeight }
  })

  const contentHeight = rows.length > 0 ? rows.length * (rowHeight + rowGap) - rowGap : rowHeight
  const height = titleHeight + contentHeight + padding / 2
  const canvasWidth = width + cardMargin * 2
  const canvasHeight = height + cardMargin * 2

  const lines = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth * scale}" height="${canvasHeight * scale}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">`)
  lines.push(cardShadowDefs())
  lines.push('<rect width="100%" height="100%" fill="#f1f1f4"/>')
  lines.push(`<rect x="${cardMargin / 2}" y="${cardMargin / 2}" width="${width + cardMargin}" height="${height + cardMargin}" rx="24" fill="#ffffff" stroke="#e4e4e7" filter="url(#cardShadow)"/>`)
  lines.push(`<g transform="translate(${cardMargin} ${cardMargin})">`)
  lines.push(`<style>text{font-family:Arial,Helvetica,sans-serif}.muted{fill:#71717a}.mono{font-family:'Courier New',monospace}</style>`)
  lines.push(`<text x="${padding}" y="54" fill="#18181b" font-size="32" font-weight="700">${tr ? 'Ders Yükü Tablosu' : 'Course Workload Table'}</text>`)
  lines.push(`<text x="${padding}" y="82" class="muted" font-size="17" font-weight="600">${rows.length} ${tr ? 'ders' : 'courses'}</text>`)

  let y = titleHeight
  rows.forEach(({ course, items, reviewNote, hasAssessments, totalWeight }) => {
    lines.push(`<rect x="${padding}" y="${y}" width="${width - padding * 2}" height="${rowHeight}" rx="14" fill="#ffffff" stroke="#e4e4e7" stroke-width="1.5"/>`)
    lines.push(`<text x="${padding + 18}" y="${y + 36}" fill="#18181b" class="mono" font-size="18" font-weight="700">${escapeSvg(truncate(course.code, courseColW - 36, 18))}</text>`)
    lines.push(`<text x="${padding + 18}" y="${y + 58}" class="muted" font-size="14" font-weight="600">${escapeSvg(truncate(course.name, courseColW - 36, 14))}</text>`)

    if (!hasAssessments || reviewNote) {
      const message = reviewNote || noDataText
      lines.push(`<text x="${barLeft + 16}" y="${y + rowHeight / 2 + 5}" class="muted" font-size="14" font-style="italic">${escapeSvg(truncate(message, barWidth - 32, 14))}</text>`)
    } else {
      let x = barLeft
      items.forEach((item, index) => {
        const segW = Math.max(6, (item.weight / (totalWeight || 100)) * barWidth)
        const color = COURSE_COLORS[index % COURSE_COLORS.length]
        lines.push(`<rect x="${x}" y="${y + 8}" width="${segW}" height="${rowHeight - 16}" fill="${color}" fill-opacity="0.12"/>`)
        lines.push(`<rect x="${x}" y="${y + 8}" width="3" height="${rowHeight - 16}" fill="${color}"/>`)

        // Narrow (low-weight) segments shrink the font instead of relying
        // purely on truncation -- keeps short labels like "Lab Work" fully
        // readable on two lines rather than clipped to fit a 13px line.
        const nameFontSize = segW < 65 ? 11 : segW < 100 ? 12 : 13
        const weightFontSize = Math.max(10, nameFontSize - 1)
        const nameLineHeight = nameFontSize + 2
        const nameLines = wrapText(item.type, segW - 12, nameFontSize)
        const gapBelowName = 6
        const blockHeight = nameLines.length * nameLineHeight + gapBelowName + weightFontSize
        let cursorY = y + rowHeight / 2 - blockHeight / 2 + nameLineHeight - 4
        nameLines.forEach(lineText => {
          lines.push(`<text x="${x + segW / 2}" y="${cursorY}" fill="#18181b" font-size="${nameFontSize}" text-anchor="middle">${escapeSvg(lineText)}</text>`)
          cursorY += nameLineHeight
        })
        cursorY += gapBelowName
        lines.push(`<text x="${x + segW / 2}" y="${cursorY}" class="muted" font-size="${weightFontSize}" font-weight="700" text-anchor="middle">%${item.weight}</text>`)

        x += segW
      })
    }

    const complete = totalWeight === 100
    const badgeBg = !hasAssessments ? '#f4f4f5' : complete ? '#dcfce7' : '#fef3c7'
    const badgeFg = !hasAssessments ? '#a1a1aa' : complete ? '#16a34a' : '#d97706'
    const badgeWidth = 58
    const badgeX = width - padding - badgeWidth
    lines.push(`<rect x="${badgeX}" y="${y + rowHeight / 2 - 15}" width="${badgeWidth}" height="30" rx="8" fill="${badgeBg}"/>`)
    lines.push(`<text x="${badgeX + badgeWidth / 2}" y="${y + rowHeight / 2 + 5}" fill="${badgeFg}" font-size="14" font-weight="700" text-anchor="middle">%${hasAssessments ? totalWeight : 0}</text>`)

    y += rowHeight + rowGap
  })

  lines.push('</g>')
  lines.push('</svg>')
  return lines.join('')
}

export function workloadImagePng(basket, language = 'tr') {
  const svg = workloadImageSvg(basket, language)
  const widthMatch = svg.match(/width="(\d+)"/)
  const heightMatch = svg.match(/height="(\d+)"/)
  const width = widthMatch ? Number(widthMatch[1]) : 900
  const height = heightMatch ? Number(heightMatch[1]) : 600

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
      reject(new Error('Workload SVG could not be rasterized'))
    }
    img.src = url
  })
}
