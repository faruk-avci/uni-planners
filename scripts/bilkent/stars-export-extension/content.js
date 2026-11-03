// UniPlanners - Bilkent STARS export.
// Reads the curriculum, elective-pool or course-offerings page open in this
// tab and saves it as JSON when the button is pressed. It never fetches, opens
// or clicks anything.
(() => {
  if (window.__uniplannersStarsExport) return
  window.__uniplannersStarsExport = true

  const FOLDER = 'uniplanners-bilkent'
  const url = new URL(location.href)
  const param = name => url.searchParams.get(name) || ''
  const kind = /\/plainOfferings\.php$/.test(url.pathname) ? 'offerings'
    : /\/courses\.php$/.test(url.pathname) ? 'elective-pool'
      : param('program_kod') ? 'curriculum' : ''
  if (!kind) return

  const program = param('program_kod')
  const track = param('track_kod')
  const language = param('dil')
  const programKey = `${program}|${track}`

  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim()
  const num = value => {
    const n = Number(String(value).replace(',', '.'))
    return value !== '' && Number.isFinite(n) ? n : null
  }
  const safe = value => String(value).replace(/[^A-Za-z0-9_-]+/g, '_')
  const SLOT_COUNT = /\s*\((\d+)\)\s*$/

  // Header text -> field. Columns we do not know are kept under `extra`, so
  // pages opened with more options (ECTS, prerequisites...) lose nothing.
  const COLUMNS = [
    [/^#$/, null],
    [/^(ders kod|course code|kod$|code$)/i, 'code'],
    [/^(ders ad|course name|course title|ad$|name$|title$)/i, 'name'],
    [/^(kredi|credits?)$/i, 'credits'],
    [/^(akts|ects)/i, 'ects'],
  ]
  const fieldOf = header => {
    for (const [pattern, field] of COLUMNS) if (pattern.test(header)) return field
    return header
  }
  function readRow(row, headers) {
    const item = {}
    const extra = {}
    ;[...row.querySelectorAll('td')].forEach((cell, i) => {
      const field = fieldOf(headers[i] || `column ${i + 1}`)
      const value = text(cell)
      if (field === null) return
      if (field === 'credits' || field === 'ects') item[field] = num(value)
      else if (field === 'code' || field === 'name') item[field] = value
      else if (value) extra[field] = value
    })
    if (Object.keys(extra).length) item.extra = extra
    return item
  }

  function termOf(label, index) {
    const lower = label.toLocaleLowerCase('tr-TR')
    if (/güz|fall|autumn/.test(lower)) return 'fall'
    if (/bahar|spring/.test(lower)) return 'spring'
    if (/yaz|summer/.test(lower)) return 'summer'
    return ['fall', 'spring', 'summer'][index] || `term${index + 1}`
  }

  function readCurriculum() {
    const semesters = {}
    const pools = {}
    const warnings = []
    let year = 0
    let term = null
    let termIndex = 0
    let headers = []
    let rows = 0
    for (const row of document.querySelectorAll('table.c_table tr')) {
      if (row.querySelector('th.c_year')) { year += 1; term = null; termIndex = 0; continue }
      if (row.querySelector('th.c_term_header')) { term = termOf(text(row), termIndex++); continue }
      if (row.classList.contains('c_header')) { headers = [...row.children].map(text); continue }
      if (!row.querySelector('td')) continue
      const item = readRow(row, headers)
      if (!year || !term) { warnings.push(`no year/term for row: ${text(row)}`); continue }
      const list = ((semesters[year] ||= {})[term] ||= [])
      rows += 1
      if (item.code) { list.push(item); continue }
      // Elective slot: "Seçmeli Ders (2)" worth 6 credits is two 3-credit slots.
      const name = item.name || ''
      const count = Number((name.match(SLOT_COUNT) || [])[1] || 1)
      const link = row.querySelector('a[href*="secmeli_kod"]')
      const poolUrl = link ? new URL(link.getAttribute('href'), location.href).href : ''
      const pool = poolUrl ? new URL(poolUrl).searchParams.get('secmeli_kod') || '' : ''
      const slot = { elective: true, name: name.replace(SLOT_COUNT, '').trim(), count, credits: item.credits ?? null, creditsPerSlot: item.credits != null ? item.credits / count : null, pool }
      if (item.extra) slot.extra = item.extra
      if (pool) pools[pool] = { name: slot.name, url: poolUrl }
      list.push(slot)
    }
    const terms = Object.values(semesters).reduce((total, terms) => total + Object.keys(terms).length, 0)
    return {
      data: { source: 'bilkent-stars', kind, version: 1, savedAt: new Date().toISOString(), url: location.href, language, department: param('bolum_kod'), program, track, title: text(document.querySelector('.c_department')), semesters, pools, warnings },
      summary: rows ? `${year} yıl · ${terms} dönem · ${rows} satır · ${Object.keys(pools).length} seçmeli havuzu` : '',
      filename: `${FOLDER}/curriculum/${safe(program)}${track ? `__${safe(track)}` : ''}${language && language !== 'tur' ? `.${safe(language)}` : ''}.json`,
    }
  }

  function readPool() {
    const heading = text(document.querySelector('.c_department'))
    const title = (heading.match(/["“](.+?)["”]/) || [])[1] || heading
    const courses = []
    let headers = []
    for (const row of document.querySelectorAll('table.c_table tr')) {
      if (row.classList.contains('c_header')) { headers = [...row.children].map(text); continue }
      if (!row.querySelector('td')) continue
      const item = readRow(row, headers)
      if (item.code) courses.push(item)
    }
    const pool = param('secmeli_kod')
    return {
      data: { source: 'bilkent-stars', kind, version: 1, savedAt: new Date().toISOString(), url: location.href, language, department: param('department'), program, track, pool, title, heading, courses },
      summary: courses.length ? `${courses.length} ders` : '',
      filename: `${FOLDER}/pools/${safe(program)}${track ? `__${safe(track)}` : ''}/${safe(pool)}${language && language !== 'tur' ? `.${safe(language)}` : ''}.json`,
    }
  }

  // Course offerings (section times): one page per subject code and term,
  // e.g. plainOfferings.php?COURSE_CODE=EEE&SEMESTER=20261.
  // Columns: course-section, name, instructors, Bilkent credits, ECTS,
  // schedule, assigned quota (2), enrollment (3), available (2).
  const MEETING = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/
  function readMeeting(line) {
    const match = line.match(MEETING)
    if (!match) return { text: line }
    const tags = [...line.matchAll(/\[([A-Z])\]/g)].map(tag => tag[1])
    return {
      day: match[1],
      start: match[2].padStart(5, '0'),
      end: match[3].padStart(5, '0'),
      room: (line.match(/\(([^)]+)\)/) || [])[1] || '',
      kind: tags.includes('L') ? 'lab' : tags.includes('S') ? 'spare' : 'lecture',
      text: line,
    }
  }
  const count = value => {
    const match = String(value).match(/^\d+/)
    return { value: match ? Number(match[0]) : null, text: value }
  }

  function readOfferings() {
    const sections = []
    const warnings = []
    for (const row of document.querySelectorAll('#poTable tbody tr')) {
      const cells = [...row.querySelectorAll('td')]
      if (!cells.length) continue
      if (cells.length < 6) { warnings.push(`unexpected row: ${text(row)}`); continue }
      const id = text(cells[0])
      // Course numbers are usually 3 digits, but some (IR 4101, HIST 5511) have 4.
      const parsed = id.match(/^([A-Z]{2,5}\s?\d{3,4}[A-Z]?)-(\S+)$/)
      if (!parsed) { warnings.push(`unreadable course/section: ${id}`); continue }
      const spans = [...cells[2].querySelectorAll('span')].map(text).filter(Boolean)
      const instructors = spans.length ? spans : cells[2].innerText.split('\n').map(line => line.trim()).filter(Boolean)
      // One meeting per <br>-separated line of the schedule cell.
      const lines = cells[5].innerHTML.split(/<br\s*\/?>/i).map(part => {
        const holder = document.createElement('div')
        holder.innerHTML = part
        return text(holder)
      }).filter(Boolean)
      const section = {
        code: parsed[1].replace(/^([A-Z]+)(\d)/, '$1 $2'),
        section: parsed[2],
        name: text(cells[1]),
        instructors,
        bilkentCredits: num(text(cells[3])),
        ects: num(text(cells[4])),
        meetings: lines.map(readMeeting),
      }
      if (cells.length >= 13) {
        section.quota = { assigned: count(text(cells[6])), total: count(text(cells[7])) }
        section.enrolled = { mandatory: count(text(cells[8])).value, elective: count(text(cells[9])).value, total: count(text(cells[10])).value }
        section.available = { assigned: count(text(cells[11])), total: count(text(cells[12])) }
      }
      sections.push(section)
    }
    const term = text(document.querySelector('#prpoDiv b'))
    const department = text(document.querySelector('#prpoDiv .title')).replace(/^Offerings of\s+/i, '')
    const courses = new Set(sections.map(item => item.code)).size
    const subject = param('COURSE_CODE')
    const semester = param('SEMESTER')
    return {
      data: { source: 'bilkent-stars', kind, version: 1, savedAt: new Date().toISOString(), url: location.href, subject, semester, term, department, sections, warnings },
      summary: sections.length ? `${courses} ders · ${sections.length} şube${term ? ` · ${term}` : ''}` : '',
      filename: `${FOLDER}/offerings/${safe(semester || 'term')}/${safe(subject || 'unknown')}.json`,
    }
  }

  const read = () => (kind === 'curriculum' ? readCurriculum() : kind === 'offerings' ? readOfferings() : readPool())

  // Which pages were saved: per program (curriculum and its elective pools),
  // or per term for offerings, so the panel can show what is still missing.
  const storageKey = kind === 'offerings' ? `saved:offerings:${param('SEMESTER')}` : `saved:${programKey}`
  const loadSaved = () => new Promise(resolve => chrome.storage.local.get(storageKey, result => resolve(result?.[storageKey] || { pools: {}, subjects: {} })))
  async function markSaved() {
    const saved = await loadSaved()
    if (kind === 'curriculum') saved.curriculum = new Date().toISOString()
    else if (kind === 'offerings') saved.subjects = { ...saved.subjects, [param('COURSE_CODE')]: new Date().toISOString() }
    else saved.pools = { ...saved.pools, [param('secmeli_kod')]: new Date().toISOString() }
    await new Promise(resolve => chrome.storage.local.set({ [storageKey]: saved }, resolve))
  }

  // Panel, in a shadow root so the page's Bootstrap styles do not reach it.
  const host = document.createElement('div')
  host.id = 'uniplanners-stars-export'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 300px; max-height: calc(100vh - 32px); overflow: auto;
        font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c2326; background: #fff;
        border: 1px solid #d5dcdd; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16); }
      header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #1d5e66; color: #fff; border-radius: 9px 9px 0 0; }
      header strong { font-size: 13px; }
      header button { all: unset; cursor: pointer; padding: 0 4px; font-size: 16px; line-height: 1; }
      .body { padding: 12px; display: grid; gap: 8px; }
      .kind { font-weight: 600; }
      .muted { color: #5b676a; }
      .error { color: #a3271f; }
      .save { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 9px 12px; color: #fff; background: #1d5e66; border-radius: 7px; font-weight: 600; }
      .save:hover { background: #164a51; }
      .save[disabled] { cursor: default; background: #9aa6a8; }
      .status { font-size: 12px; word-break: break-all; }
      h3 { margin: 6px 0 0; font-size: 12px; font-weight: 600; }
      ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }
      li { display: grid; grid-template-columns: 16px 1fr; gap: 6px; font-size: 12px; }
      li a { color: #1d5e66; }
      li code { color: #5b676a; font-size: 11px; }
      .done { color: #1d7a3a; }
      .collapsed .body { display: none; }
      .collapsed header { border-radius: 9px; }
    </style>
    <div class="panel">
      <header><strong>UniPlanners · Bilkent</strong><button type="button" class="toggle" title="Küçült">–</button></header>
      <div class="body"></div>
    </div>`
  document.documentElement.appendChild(host)
  const panel = root.querySelector('.panel')
  const body = root.querySelector('.body')
  root.querySelector('.toggle').addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed')
    root.querySelector('.toggle').textContent = collapsed ? '+' : '–'
  })

  const escapeHtml = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])

  // The last save message survives re-renders (the pool checklist re-renders
  // when storage changes, right after a save).
  let lastStatus = ''
  async function render(status = '') {
    if (status) lastStatus = status
    status = lastStatus
    const result = read()
    const saved = await loadSaved()
    const label = kind === 'curriculum'
      ? `Müfredat · ${escapeHtml(program)}${track ? ` · ${escapeHtml(track)}` : ''}`
      : kind === 'offerings'
        ? `Ders saatleri · ${escapeHtml(param('COURSE_CODE'))} <span class="muted">(${escapeHtml(param('SEMESTER'))})</span>`
        : `Seçmeli havuzu · ${escapeHtml(param('secmeli_kod'))} <span class="muted">(${escapeHtml(program)})</span>`
    const alreadySaved = kind === 'curriculum' ? saved.curriculum
      : kind === 'offerings' ? saved.subjects?.[param('COURSE_CODE')]
        : saved.pools?.[param('secmeli_kod')]
    let html = `<div class="kind">${label}</div>`
    html += result.summary
      ? `<div class="muted">${escapeHtml(result.summary)}</div>`
      : '<div class="error">Bu sayfada tablo bulunamadı.</div>'
    if (result.data.warnings?.length) html += `<div class="error">${result.data.warnings.length} satır okunamadı.</div>`
    html += `<button type="button" class="save" ${result.summary ? '' : 'disabled'}>${alreadySaved ? 'JSON’u tekrar indir' : 'JSON indir'}</button>`
    html += `<div class="status muted">${status || (alreadySaved ? `Daha önce kaydedildi: ${escapeHtml(new Date(alreadySaved).toLocaleString('tr-TR'))}` : `İndirilenler/${escapeHtml(result.filename)}`)}</div>`
    if (kind === 'curriculum') {
      const pools = Object.entries(result.data.pools)
      if (pools.length) {
        const done = pools.filter(([code]) => saved.pools?.[code]).length
        html += `<h3>Seçmeli havuzları (${done}/${pools.length} kaydedildi)</h3><ul>`
        for (const [code, pool] of pools) {
          const isDone = Boolean(saved.pools?.[code])
          html += `<li><span class="${isDone ? 'done' : 'muted'}">${isDone ? '✓' : '○'}</span><span><a href="${escapeHtml(pool.url)}" target="_courses">${escapeHtml(pool.name)}</a> <code>${escapeHtml(code)}</code></span></li>`
        }
        html += '</ul>'
      }
    }
    if (kind === 'offerings') {
      const subjects = Object.keys(saved.subjects || {}).sort()
      if (subjects.length) html += `<h3>Bu dönem kaydedilen kodlar (${subjects.length})</h3><div class="muted">${escapeHtml(subjects.join(', '))}</div>`
    }
    body.innerHTML = html
    body.querySelector('.save').addEventListener('click', () => save(result))
  }

  function save(result) {
    const content = JSON.stringify(result.data, null, 2)
    chrome.runtime.sendMessage({ type: 'download', filename: result.filename, content }, async response => {
      void chrome.runtime.lastError
      if (!response?.ok) {
        render(`<span class="error">Kaydedilemedi: ${escapeHtml(response?.error || 'bilinmeyen hata')}</span>`)
        return
      }
      await markSaved()
      // Chrome reports the full path; compare it with the name we asked for.
      const path = String(response.path || '').replace(/\\/g, '/')
      const expected = result.filename.split('/').pop()
      if (path && !path.endsWith(result.filename) && !path.endsWith(expected)) {
        render(`<span class="error">Chrome dosyayı başka adla kaydetti:</span> ${escapeHtml(path)}<br>Beklenen ad: ${escapeHtml(expected)}. Başka bir indirme eklentisi adları değiştiriyor olabilir.`)
        return
      }
      render(`<span class="done">✓ Kaydedildi:</span> ${escapeHtml(path || `İndirilenler/${result.filename}`)}`)
    })
  }

  // Keep the pool checklist current when a pool is saved in another tab.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[storageKey] && kind !== 'elective-pool') render()
  })

  render()
})()
