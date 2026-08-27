import { useState, useEffect, useRef } from 'react'
import './styles/tokens.css'
import './styles/base.css'
import './styles/animations.css'
import './App.css'
import Header from './components/layout/Header'
import ProfileBar from './components/profile/ProfileBar'
import SearchSection from './components/search/SearchSection'
import BasketPanel from './components/basket/BasketPanel'
import SchedulePreview from './components/schedule/SchedulePreview'
import FreeDaySelector from './components/schedule/FreeDaySelector'
import CurriculumPage from './components/curriculum/CurriculumPage'
import DinoGame from './components/dino/DinoGame'
import MajorPrompt from './components/onboarding/MajorPrompt'
import HowToPage from './components/howto/HowToPage'
import SharedSchedulePage from './components/shared/SharedSchedulePage'
import CorequisitePrompt from './components/coreq/CorequisitePrompt'
import DegreeAuditUpload from './components/audit/DegreeAuditUpload'
import SurveyNudge from './components/survey/SurveyNudge'
import { courseService } from './services/courseService'
import { scheduleImagePng } from './utils/scheduleImageSvg'
import { recordGenerateSuccess, shouldQueueSurveyNudge, markSurveyNudgeShown, markSurveyNudgeDone } from './utils/surveyNudge'
import { canonicalProgramCode, groupMajorOptions } from './data/programs'

const isUndergraduateMajor = value => Boolean(value && !['none', 'master', 'doctorate'].includes(value))
const sharedIdFromPath = pathname => String(pathname || '').match(/^\/share\/([A-Za-z0-9]{8})\/?$/)?.[1] || ''
const legacyPathFromHash = hash => {
  const value = String(hash || '')
  if (value === '#/curriculum') return '/curriculum'
  if (value === '#/how-to') return '/how-to'
  const sharedId = value.match(/^#\/share\/([A-Za-z0-9]{8})$/)?.[1]
  return sharedId ? `/share/${sharedId}` : ''
}
const routeFromLocation = () => {
  const pathname = legacyPathFromHash(window.location.hash) || window.location.pathname
  const sharedId = sharedIdFromPath(pathname)
  if (sharedId) return { page: 'shared', sharedId }
  if (/^\/curriculum\/?$/.test(pathname)) return { page: 'curriculum', sharedId: '' }
  if (/^\/how-to\/?$/.test(pathname)) return { page: 'howto', sharedId: '' }
  return { page: 'planner', sharedId: '' }
}
const PUBLIC_COLOR_THEMES = new Set(['iris', 'neutral', 'ozu', 'ocean', 'forest', 'violet', 'coral'])
const FAVICON_COLORS = {
  iris: '#6658e8',
  neutral: '#18181b',
  ozu: '#a50050',
  ocean: '#2563eb',
  forest: '#15803d',
  violet: '#7c3aed',
  coral: '#d94f3d',
}
const AUTO_COREQ_ADD_SOURCES = new Set(['fitting', 'curriculum', 'curriculum_elective', 'elective_popup'])
const ENGLISH_DAY_NAMES = {
  Pazartesi: 'Monday',
  Salı: 'Tuesday',
  Çarşamba: 'Wednesday',
  Perşembe: 'Thursday',
  Cuma: 'Friday',
}

function App() {
  const initialRoute = useRef(routeFromLocation()).current
  const [language, setLanguage] = useState('tr')
  const [siteSettings, setSiteSettings] = useState({ mainFont: 'system', catalogTerm: '2025-2026 Yaz', surveyUrl: '' })
  const [colorTheme, setColorTheme] = useState(() => {
    const saved = localStorage.getItem('uniplanner_color_theme')
    return PUBLIC_COLOR_THEMES.has(saved) ? saved : 'iris'
  })
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('uniplanner_dark_mode')
    if (saved === '1') return true
    if (saved === '0') return false
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  })
  const logoPresses = useRef((Number(localStorage.getItem('uniplanner_logo_presses')) || 0) % 20)
  const [dinoMode, setDinoMode] = useState(() => localStorage.getItem('uniplanner_dino_mode') === 'true')
  const [dinoOpen, setDinoOpen] = useState(() => localStorage.getItem('uniplanner_dino_mode') === 'true')
  // Independent, unrelated easter egg — a different press count than Dino's,
  // never reset by Dino's own counter/toggle.
  const auditLogoPresses = useRef((Number(localStorage.getItem('uniplanner_audit_logo_presses')) || 0) % 25)
  const [auditUnlocked, setAuditUnlocked] = useState(() => localStorage.getItem('uniplanner_audit_unlocked') === 'true')
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditResult, setAuditResult] = useState(() => {
    try { return JSON.parse(localStorage.getItem('uniplanner_degree_audit') || 'null') } catch { return null }
  })
  const [activePage, setActivePage] = useState(initialRoute.page)
  const [sharedScheduleId, setSharedScheduleId] = useState(initialRoute.sharedId)
  // Basket model: each item is a course. `sections: []` = whole course (all
  // sections); a non-empty list pins specific sections. A course is either
  // whole OR section-specific, never both (ported from v1 rules).
  // Loaded from / persisted to the server per anonymous session.
  const [basket, setBasket] = useState([])
  const [basketLoaded, setBasketLoaded] = useState(false)
  const [savedBaskets, setSavedBaskets] = useState([])
  const [mobileBasketOpen, setMobileBasketOpen] = useState(false)
  const [coreqPrompt, setCoreqPrompt] = useState(null)
  const [notice, setNotice] = useState(null) // { type: 'error'|'success', text }
  const [freeDays, setFreeDays] = useState([])
  const [freeDayFallback, setFreeDayFallback] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [currentSchedule, setCurrentSchedule] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [sharingSchedule, setSharingSchedule] = useState(false)
  const [scheduleShareCopied, setScheduleShareCopied] = useState(false)
  const [exportingSchedule, setExportingSchedule] = useState(false)
  const [exportingCalendar, setExportingCalendar] = useState(false)
  const [genMessage, setGenMessage] = useState(null)
  const [generationInsights, setGenerationInsights] = useState(null)
  const [fittingCourses, setFittingCourses] = useState([])
  const [fittingElectiveLabels, setFittingElectiveLabels] = useState({})
  const [fittingShown, setFittingShown] = useState(false)
  const [fittingLoading, setFittingLoading] = useState(false)
  const [expandedFits, setExpandedFits] = useState(() => new Set())
  const [openFitGroups, setOpenFitGroups] = useState(() => new Set())
  const [fitTypeFilter, setFitTypeFilter] = useState(() => new Set()) // empty = show all
  const [fitCreditFilter, setFitCreditFilter] = useState('all')
  const [majorsList, setMajorsList] = useState([])
  const [grade, setGrade] = useState(() => localStorage.getItem('uniplanner_grade') || '')
  // '' = not chosen yet, 'none' = user declined to share, otherwise a program code
  const [major, setMajor] = useState(() => canonicalProgramCode(localStorage.getItem('uniplanner_major') || ''))
  const [majorPreferenceLoaded, setMajorPreferenceLoaded] = useState(() => Boolean(localStorage.getItem('uniplanner_major')))
  const [majorPromptReason, setMajorPromptReason] = useState(null)
  const generatedSchedulesRef = useRef(null)
  const fittingCoursesRef = useRef(null)
  const fittingResultsRef = useRef(null)
  const fittingGroupRefs = useRef(new Map())
  const pendingFitGroupScrollRef = useRef('')
  const scrollToFittingResults = useRef(false)
  const shareCopiedTimerRef = useRef(null)
  const notifyTimerRef = useRef(null)
  const scrollToGenerated = useRef(false)
  const [surveyNudgeVisible, setSurveyNudgeVisible] = useState(false)
  const surveyNudgeTimerRef = useRef(null)
  const surveyNudgeQueuedRef = useRef(false)

  useEffect(() => () => window.clearTimeout(surveyNudgeTimerRef.current), [])

  // Queued after a generate/share/export that went well, shown only after a
  // delay so it never interrupts the moment someone actually wants to look
  // at what they just did. shouldQueueSurveyNudge caps how often this can
  // ever fire; surveyNudgeQueuedRef just stops two triggers close together
  // (e.g. generate then share) from stacking two separate timers.
  const queueSurveyNudge = reason => {
    if (!siteSettings.surveyUrl || surveyNudgeQueuedRef.current) return
    if (!shouldQueueSurveyNudge(reason)) return
    surveyNudgeQueuedRef.current = true
    surveyNudgeTimerRef.current = window.setTimeout(() => {
      markSurveyNudgeShown()
      setSurveyNudgeVisible(true)
    }, 12_000)
  }

  const dismissSurveyNudge = () => {
    setSurveyNudgeVisible(false)
    surveyNudgeQueuedRef.current = false
  }

  const handleFillSurvey = () => {
    markSurveyNudgeDone()
    setSurveyNudgeVisible(false)
    surveyNudgeQueuedRef.current = false
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('uniplanner_dark_mode', darkMode ? '1' : '0')
  }, [darkMode])

  const toggleDarkMode = () => setDarkMode(value => !value)

  useEffect(() => {
    courseService.getSiteSettings()
      .then(settings => setSiteSettings(current => ({ ...current, ...settings })))
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-site-font', siteSettings.mainFont || 'system')
  }, [siteSettings.mainFont])

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', colorTheme)
    localStorage.setItem('uniplanner_color_theme', colorTheme)

    const favicon = document.querySelector('link[rel="icon"]')
    const faviconColor = FAVICON_COLORS[colorTheme] || FAVICON_COLORS.iris
    if (favicon) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${faviconColor}"/></svg>`
      favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    }
  }, [colorTheme])

  useEffect(() => {
    const syncPage = () => {
      const legacyPath = legacyPathFromHash(window.location.hash)
      if (legacyPath) window.history.replaceState(null, '', legacyPath)
      const route = routeFromLocation()
      setSharedScheduleId(route.sharedId)
      setActivePage(route.page)
    }
    syncPage()
    window.addEventListener('popstate', syncPage)
    return () => window.removeEventListener('popstate', syncPage)
  }, [])

  useEffect(() => {
    if (activePage === 'curriculum' && majorPreferenceLoaded && !major) setMajorPromptReason('curriculum')
  }, [activePage, major, majorPreferenceLoaded])

  useEffect(() => {
    if (!mobileBasketOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape') setMobileBasketOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileBasketOpen])

  const navigate = page => {
    const path = page === 'curriculum' ? '/curriculum' : page === 'howto' ? '/how-to' : '/'
    window.history.pushState(null, '', path)
    setSharedScheduleId('')
    setActivePage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Majors for the "courses that fit" major picker
  useEffect(() => {
    courseService.getMajors().then(list => setMajorsList(list || []))
  }, [])

  useEffect(() => {
    const localMajor = canonicalProgramCode(localStorage.getItem('uniplanner_major') || '')
    courseService.getPreferences()
      .then(preferences => {
        const serverMajor = preferences?.major ? canonicalProgramCode(preferences.major) : ''
        if (serverMajor) {
          // Server already knows the major — nothing to (re-)send.
          setMajor(serverMajor)
          localStorage.setItem('uniplanner_major', serverMajor)
        } else if (localMajor) {
          // Session has no major yet (e.g. cookie was cleared) but this
          // browser already chose one — sync it once instead of every load.
          setMajor(localMajor)
          courseService.saveMajorPreference(localMajor, 'existing_browser').catch(() => {})
        }
        const localGrade = localStorage.getItem('uniplanner_grade') || ''
        if (preferences?.grade) {
          setGrade(preferences.grade)
          localStorage.setItem('uniplanner_grade', preferences.grade)
        } else if (localGrade) {
          courseService.saveGradePreference(localGrade).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setMajorPreferenceLoaded(true))
  }, [])

  useEffect(() => {
    courseService.getSavedBaskets()
      .then(items => setSavedBaskets(Array.isArray(items) ? items : []))
      .catch(error => console.error('Saved baskets could not be loaded:', error))
  }, [])

  // Load the saved basket for this session (with assessment breakdowns).
  useEffect(() => {
    (async () => {
      const items = await courseService.getBasket()
      if (Array.isArray(items) && items.length > 0) {
        const data = await courseService.getAssessments(items.map(i => i.code))
        setBasket(items.map(i => ({ ...i, assessments: data[i.code] || [] })))
      }
      setBasketLoaded(true)
    })()
  }, [])

  // Persist the basket whenever it changes (debounced). Skips the initial load
  // so we never overwrite the saved basket with the empty starting state.
  useEffect(() => {
    if (!basketLoaded) return
    const t = setTimeout(() => {
      courseService.saveBasket(basket.map(i => ({ code: i.code, sections: i.sections || [], source: i.source || null })))
    }, 500)
    return () => clearTimeout(t)
  }, [basket, basketLoaded])

  // Sync assessments on mount / basket initialization
  useEffect(() => {
    const fetchAssessments = async () => {
      const codesToFetch = basket
        .filter(c => !c.assessments)
        .map(c => c.code);

      if (codesToFetch.length === 0) return;

      const data = await courseService.getAssessments(codesToFetch);
      setBasket(prev => prev.map(course => (
        data[course.code]
          ? { ...course, assessments: data[course.code] }
          : { ...course, assessments: [] }
      )));
    };

    fetchAssessments();
  }, []);

  const selectColorTheme = nextTheme => {
    setColorTheme(nextTheme)
  }

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'tr' ? 'en' : 'tr')
  }

  const notify = (type, text, duration = 3500) => {
    setNotice({ type, text })
    window.clearTimeout(notifyTimerRef.current)
    notifyTimerRef.current = window.setTimeout(() => setNotice(null), duration)
  }

  const tr = (a, b) => (language === 'tr' ? a : b)

  const handleLogoClick = () => {
    navigate('planner')
    logoPresses.current += 1
    localStorage.setItem('uniplanner_logo_presses', String(logoPresses.current))

    if (logoPresses.current === 20) {
      logoPresses.current = 0
      localStorage.setItem('uniplanner_logo_presses', '0')

      setDinoMode(current => {
        const next = !current
        localStorage.setItem('uniplanner_dino_mode', String(next))
        setDinoOpen(next)
        notify('success', next
          ? tr('Dino modu açıldı!', 'Dino Mode activated!')
          : tr('Dino modu kapatıldı.', 'Dino Mode deactivated.'))
        return next
      })
    }

    auditLogoPresses.current += 1
    localStorage.setItem('uniplanner_audit_logo_presses', String(auditLogoPresses.current))
    // >= rather than === so a double-fired click event (or a click missed
    // earlier and caught up on a later render) can't skip past the exact
    // trigger count and leave the counter stuck above threshold forever.
    if (auditLogoPresses.current >= 25) {
      auditLogoPresses.current = 0
      localStorage.setItem('uniplanner_audit_logo_presses', '0')
      localStorage.setItem('uniplanner_audit_unlocked', 'true')
      setAuditUnlocked(true)
      setAuditOpen(open => {
        const next = !open
        if (next) notify('success', tr('Mezuniyet denetimi yüklemesi açıldı.', 'Degree audit upload unlocked.'))
        return next
      })
    } else if (auditLogoPresses.current >= 20) {
      notify('info', `${auditLogoPresses.current}/25`, 1200)
    }
  }

  const normalizeCourseCode = code => String(code || '').replace(/\s+/g, '').toUpperCase()

  const canAddCourse = (course, sections) => {
    const existing = basket.find(item => normalizeCourseCode(item.code) === normalizeCourseCode(course.code))
    if (sections.length === 0 && existing?.sections?.length === 0) {
      notify('error', tr(`${course.code} zaten sepetinizde.`, `${course.code} is already in your basket.`))
      return false
    }
    if (sections.length > 0 && existing?.sections?.length === 0) {
      notify('error', tr(
        `${course.code} dersinin tamamı sepette. Tek şube eklenemez.`,
        `The entire course ${course.code} is in your basket. Cannot add individual sections.`))
      return false
    }
    if (sections.length > 0 && sections.every(section => existing?.sections?.includes(section))) {
      notify('error', tr('Bu şube(ler) zaten sepette.', 'That section is already in your basket.'))
      return false
    }
    return true
  }

  // Adds the explicit course/section selection. Selected discovery surfaces
  // may additionally resolve a corequisite in addCourseToBasket below.
  const commitCourseToBasket = (course, sectionNames, source = 'search', silent = false) => {
    const sections = Array.isArray(sectionNames) ? sectionNames : []
    const existing = basket.find(item => normalizeCourseCode(item.code) === normalizeCourseCode(course.code))
    let mainMsg = null

    if (sections.length === 0) {
      // If some individual sections of this course were already pinned,
      // "Add All" replaces that partial pin with the whole-course entry
      // instead of being blocked or creating a duplicate basket item.
      setBasket(prev => [
        ...prev.filter(item => normalizeCourseCode(item.code) !== normalizeCourseCode(course.code)),
        { code: course.code, name: course.name, credits: course.credits, sections: [], assessments: course.assessments || [], source }
      ])
      mainMsg = tr(`${course.code} eklendi`, `${course.code} added`)
    } else {
      const toAdd = sections.filter(section => !(existing?.sections || []).includes(section))
      setBasket(prev => {
        const found = prev.find(item => normalizeCourseCode(item.code) === normalizeCourseCode(course.code))
        if (found) {
          return prev.map(item => normalizeCourseCode(item.code) === normalizeCourseCode(course.code)
            ? { ...item, sections: [...item.sections, ...toAdd] }
            : item)
        }
        return [...prev, {
          code: course.code, name: course.name, credits: course.credits,
          sections: [...toAdd], assessments: course.assessments || [], source
        }]
      })
      const shorts = toAdd.map(section => section.replace(course.code, '').trim()).join('/')
      mainMsg = tr(`${course.code} ${shorts} eklendi`, `${course.code} ${shorts} added`)
    }

    courseService.trackCourseAdd(course.code, source, sections.length > 0 ? 'sections' : 'course')
    if (!silent) notify('success', `${mainMsg}.`)
    return mainMsg
  }

  const addCourseToBasket = async (course, sectionNames, source = 'search') => {
    const sections = Array.isArray(sectionNames) ? sectionNames : []
    if (!canAddCourse(course, sections)) return

    if (!AUTO_COREQ_ADD_SOURCES.has(source)) {
      commitCourseToBasket(course, sections, source)
      return
    }

    const mainMsg = commitCourseToBasket(course, sections, source, true)
    const seen = new Set()
    const missingCodes = String(course.coreq || '')
      .split(/[,;]+/)
      .map(value => value.trim())
      .filter(value => {
        const code = normalizeCourseCode(value)
        if (!code || seen.has(code)) return false
        seen.add(code)
        return !basket.some(item => normalizeCourseCode(item.code) === code)
      })

    const resolved = (await Promise.all(missingCodes.map(code => courseService.getCourse(code))))
      .filter(corequisite => corequisite?.code)

    if (resolved.length > 0) {
      setBasket(current => {
        const next = [...current]
        for (const corequisite of resolved) {
          if (next.some(item => normalizeCourseCode(item.code) === normalizeCourseCode(corequisite.code))) continue
          next.push({
            code: corequisite.code,
            name: corequisite.name,
            credits: corequisite.credits,
            sections: [],
            assessments: corequisite.assessments || [],
            source: 'coreq',
          })
        }
        return next
      })
      for (const corequisite of resolved) {
        courseService.trackCourseAdd(corequisite.code, 'coreq', 'course')
      }
      notify('success', tr(
        `${mainMsg}; yan koşulu ${resolved.map(item => item.code).join(', ')} da sepete eklendi.`,
        `${mainMsg}; corequisite ${resolved.map(item => item.code).join(', ')} was also added to the basket.`))
      return
    }

    notify('success', `${mainMsg}.`)
  }

  // Remove one pinned section; if it was the last, remove the course entirely.
  const removeSection = (code, sectionName) => {
    setBasket(prev => prev.flatMap(item => {
      if (item.code !== code) return [item]
      const remaining = item.sections.filter(s => s !== sectionName)
      return remaining.length === 0 ? [] : [{ ...item, sections: remaining }]
    }))
  }

  const handleAuditResult = result => {
    setAuditResult(result)
    if (result) {
      localStorage.setItem('uniplanner_degree_audit', JSON.stringify(result))
      if (!result.error) {
        setAuditOpen(false)
        navigate('curriculum')
      }
    } else {
      localStorage.removeItem('uniplanner_degree_audit')
    }
  }

  const removeCourseFromBasket = code => {
    setBasket(prev => prev.filter(item => normalizeCourseCode(item.code) !== normalizeCourseCode(code)))
  }

  // Course is fully in the basket (any section); user wants to exclude one or
  // more specific sections. Converts the whole-course entry into a pinned
  // list of every other section instead of just dropping the course.
  const excludeSectionFromBasket = (course, excludedSectionNames) => {
    const excluded = new Set(excludedSectionNames)
    const remaining = (course.sections || []).map(s => s.name).filter(name => !excluded.has(name))
    setBasket(prev => {
      const withoutCourse = prev.filter(item => normalizeCourseCode(item.code) !== normalizeCourseCode(course.code))
      if (remaining.length === 0) return withoutCourse
      return [...withoutCourse, {
        code: course.code,
        name: course.name,
        credits: course.credits,
        sections: remaining,
        assessments: course.assessments || [],
        source: 'search',
      }]
    })
  }

  // Renders a course code with a small × to remove it from the basket, used
  // inside the schedule-conflict diagnostics so a listed course can be
  // dropped without hunting for it in the basket panel. Removing a conflicting
  // course re-generates immediately with the updated basket instead of making
  // the user click "Generate" again.
  const conflictCourseChip = code => (
    <span className="conflict-course-chip" key={code}>
      {code}
      <button
        type="button"
        className="conflict-course-remove"
        onClick={() => {
          const nextBasket = basket.filter(item => normalizeCourseCode(item.code) !== normalizeCourseCode(code))
          setBasket(nextBasket)
          generateSchedules(null, nextBasket)
        }}
        aria-label={tr(`${code} dersini sepetten çıkar`, `Remove ${code} from basket`)}
        title={tr('Sepetten çıkar', 'Remove from basket')}
      >×</button>
    </span>
  )

  const saveMajorPreference = (value, source = 'curriculum') => {
    setMajor(value)
    localStorage.setItem('uniplanner_major', value)
    setMajorPreferenceLoaded(true)
    if (value) {
      courseService.saveMajorPreference(value, source).catch(error => {
        console.error('Major preference could not be saved:', error)
      })
    }
  }

  const saveGradePreference = value => {
    setGrade(value)
    if (value) localStorage.setItem('uniplanner_grade', value)
    else localStorage.removeItem('uniplanner_grade')
    courseService.saveGradePreference(value).catch(error => {
      console.error('Grade preference could not be saved:', error)
    })
  }

  const generateSchedules = async (overrideFreeDays = null, overrideBasket = null, options = {}) => {
    const generationFreeDays = Array.isArray(overrideFreeDays) ? overrideFreeDays : freeDays
    const generationBasket = Array.isArray(overrideBasket) ? overrideBasket : basket
    if (generationBasket.length === 0) {
      scrollToGenerated.current = true
      setGenMessage(language === 'tr' ? 'Sepetiniz boş.' : 'Your basket is empty.')
      setSchedules([])
      return
    }
    setGenerating(true)
    const result = await courseService.generateSchedule(generationBasket, generationFreeDays, options)
    setGenerating(false)

    if (result.error === 'MISSING_COREQUISITES') {
      setCoreqPrompt({ corequisites: result.corequisites || [], overrideFreeDays: generationFreeDays, basket: generationBasket })
      return
    }

    scrollToGenerated.current = true
    setFreeDayFallback(null)
    setGenerationInsights(null)
    setCurrentSchedule(0)
    setGenMessage(null)
    setScheduleShareCopied(false)
    window.clearTimeout(shareCopiedTimerRef.current)
    setFittingShown(false)
    setFittingCourses([])
    setFittingElectiveLabels({})

    if (result.freeDayFallback) {
      const requested = result.requestedFreeDays || generationFreeDays
      const alternatives = result.alternativeFreeDays || []
      setSchedules([])
      setFreeDayFallback({ requested, alternatives })
      setGenMessage(language === 'tr'
        ? `${requested.join(', ')} günü boş bırakan bir program bulunamadı.`
        : `No schedule was found that keeps ${requested.join(', ')} free.`)
    } else if (result.success && result.schedules.length > 0) {
      setSchedules(result.schedules)
      setGenMessage(null)
      recordGenerateSuccess()
      queueSurveyNudge('generate')
    } else {
      setSchedules([])
      setGenerationInsights(result.diagnostics || null)
      setGenMessage(result.diagnostics
        ? tr(
            'Bu sepetteki derslerle çakışmasız bir program oluşturulamıyor.',
            'A conflict-free schedule cannot be created with the courses in this basket.'
          )
        : (result.message || tr('Uygun program bulunamadı.', 'No valid schedule found.')))
    }
  }

  const continueWithoutCorequisite = () => {
    if (!coreqPrompt) return
    const pending = coreqPrompt
    setCoreqPrompt(null)
    generateSchedules(pending.overrideFreeDays, pending.basket, { ignoreCoreqs: true })
  }

  const cancelCorequisiteWarning = () => {
    setCoreqPrompt(null)
  }

  const addCorequisiteAndGenerate = corequisite => {
    if (!coreqPrompt) return
    const pending = coreqPrompt
    const addition = {
      code: corequisite.code,
      name: corequisite.name,
      credits: corequisite.credits,
      sections: [],
      assessments: corequisite.assessments || [],
      source: 'coreq',
    }
    const nextBasket = [...(pending.basket || basket), addition]
    courseService.trackCourseAdd(corequisite.code, 'coreq', 'course')
    setBasket(nextBasket)
    setCoreqPrompt(null)
    notify('success', tr(
      `Yan koşul ${corequisite.code} eklendi. Program oluşturuluyor.`,
      `Corequisite ${corequisite.code} added. Generating schedules.`))
    generateSchedules(pending.overrideFreeDays, nextBasket)
  }

  const handleGenerate = () => {
    if (!major) {
      setMajorPromptReason('generate')
      return
    }
    generateSchedules()
  }

  const handleMajorPromptSelect = value => {
    const pendingReason = majorPromptReason
    saveMajorPreference(value, pendingReason || 'curriculum')
    setMajorPromptReason(null)
    if (pendingReason === 'generate') {
      window.requestAnimationFrame(() => generateSchedules())
    }
  }

  useEffect(() => {
    if (generating || !scrollToGenerated.current || (schedules.length === 0 && !genMessage)) return
    scrollToGenerated.current = false
    window.requestAnimationFrame(() => {
      generatedSchedulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [generating, schedules, genMessage])

  const fetchFitting = async (forMajor) => {
    const schedule = schedules[currentSchedule]
    if (!schedule) return
    setFittingLoading(true)
    const occupied = schedule.lessons.flatMap(l => l.times)
    const exclude = basket.map(c => c.code)
    const result = await courseService.getFittingForSchedule(occupied, exclude, forMajor)
    setFittingCourses(result.courses || [])
    setFittingElectiveLabels(result.electiveLabels || {})
    setFitTypeFilter(new Set()) // reset filters for the new result
    setFitCreditFilter('all')
    setFittingLoading(false)
  }

  const toggleFitTypeFilter = (key) => {
    setFitTypeFilter(prev => {
      return prev.has(key) ? new Set() : new Set([key])
    })
  }

  const handleShowFitting = () => {
    scrollToFittingResults.current = true
    setFittingShown(true)
    setOpenFitGroups(new Set())
    // Only fetch when we have a real major; otherwise we ask for it first.
    if (isUndergraduateMajor(major)) fetchFitting(major)
  }

  useEffect(() => {
    if (!scrollToFittingResults.current || !fittingShown || fittingLoading) return
    scrollToFittingResults.current = false
    window.requestAnimationFrame(() => {
      ;(fittingResultsRef.current || fittingCoursesRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [fittingShown, fittingLoading, fittingCourses])

  const handleSelectMajor = (value) => {
    saveMajorPreference(value, 'fitting')
    if (value && value !== 'none') fetchFitting(value)
    else {
      setFittingCourses([])
      setFittingElectiveLabels({})
    }
  }

  const toggleFitExpand = (code) => {
    setExpandedFits(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const toggleFitGroup = (key) => {
    setOpenFitGroups(prev => {
      const opening = !prev.has(key)
      pendingFitGroupScrollRef.current = opening ? key : ''
      return opening ? new Set([key]) : new Set()
    })
  }

  useEffect(() => {
    const key = pendingFitGroupScrollRef.current
    if (!key || !openFitGroups.has(key)) return
    pendingFitGroupScrollRef.current = ''
    window.requestAnimationFrame(() => {
      fittingGroupRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [openFitGroups])

  const handleShareSchedule = async () => {
    const schedule = schedules[currentSchedule]
    if (!schedule || sharingSchedule) return
    setScheduleShareCopied(false)
    setSharingSchedule(true)
    try {
      const result = await courseService.shareSchedule(schedule, major)
      // The query version makes social apps refresh previews cached before the
      // dedicated shared-schedule metadata was introduced.
      const url = `${window.location.origin}/share/${result.id}?v=2`
      let copied = false
      try {
        await navigator.clipboard.writeText(url)
        copied = true
      } catch {
        const input = document.createElement('textarea')
        input.value = url
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        copied = document.execCommand('copy')
        input.remove()
      }
      if (!copied) window.prompt(tr('Paylaşım bağlantısını kopyala:', 'Copy the share link:'), url)
      if (copied) {
        setScheduleShareCopied(true)
        window.clearTimeout(shareCopiedTimerRef.current)
        shareCopiedTimerRef.current = window.setTimeout(() => setScheduleShareCopied(false), 6000)
      }
      notify('success', copied
        ? tr('Program bağlantısı panoya kopyalandı. Artık istediğin yerde paylaşabilirsin.', 'Schedule link copied to your clipboard. You can now share it anywhere.')
        : tr('Program paylaşım bağlantısı oluşturuldu.', 'Schedule share link created.'), 6000)
      queueSurveyNudge('share')
    } catch (error) {
      notify('error', tr('Program paylaşılamadı.', 'Schedule could not be shared.'))
      console.error('Schedule share failed:', error)
    } finally {
      setSharingSchedule(false)
    }
  }

  const handleExportSchedule = async (preferredLayout) => {
    const schedule = schedules[currentSchedule]
    if (!schedule || exportingSchedule) return
    setExportingSchedule(true)
    try {
      const layout = ['agenda', 'grid'].includes(preferredLayout)
        ? preferredLayout
        : (window.matchMedia('(max-width: 768px)').matches ? 'agenda' : 'grid')
      const blob = await scheduleImagePng(schedule, language, layout)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `uniplanners-program-${currentSchedule + 1}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('success', tr('Program görseli indirildi.', 'Schedule image downloaded.'))
      queueSurveyNudge('export')
    } catch (error) {
      notify('error', tr('Program görseli oluşturulamadı.', 'Schedule image could not be created.'))
      console.error('Schedule image export failed:', error)
    } finally {
      setExportingSchedule(false)
    }
  }

  const handleExportCalendar = async () => {
    const schedule = schedules[currentSchedule]
    if (!schedule || exportingCalendar) return
    setExportingCalendar(true)
    try {
      const blob = await courseService.exportScheduleCalendar(schedule, language)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `uniplanners-program-${currentSchedule + 1}.ics`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('success', tr('Takvim dosyası hazırlandı.', 'Calendar file created.'))
      queueSurveyNudge('export')
    } catch (error) {
      notify('error', tr('Takvim dosyası oluşturulamadı.', 'Calendar file could not be created.'))
      console.error('Schedule calendar export failed:', error)
    } finally {
      setExportingCalendar(false)
    }
  }

  const dayAbbr = { 'Pazartesi': 'Pzt', 'Salı': 'Sal', 'Çarşamba': 'Çar', 'Perşembe': 'Per', 'Cuma': 'Cum' }

  const electiveTypeLabel = (t) => {
    if (fittingElectiveLabels[t]) return fittingElectiveLabels[t]
    const map = {
      program: tr('Program seçmeli', 'Program elective'),
      program_external: tr('Program dışı seçmeli', 'External program elective'),
      specialization: tr('Uzmanlık seçmeli', 'Specialization elective'),
      design_studio: tr('Tasarım stüdyosu', 'Design studio'),
      finishing_project: tr('Bitirme projesi', 'Finishing project'),
      faculty: tr('Fakülte seçmeli', 'Faculty elective'),
      non_faculty: tr('Fakülte dışı seçmeli', 'Non-faculty elective'),
      certificate: tr('Sertifika seçmeli', 'Certificate elective'),
      social: tr('Sosyal seçmeli', 'Social elective'),
      social_restricted: tr('Sosyal seçmeli (kısıtlı)', 'Social elective (restricted)'),
      language: tr('Dil seçmeli', 'Language elective'),
      restricted: tr('Kısıtlı seçmeli', 'Restricted elective'),
      other: tr('Diğer seçmeli', 'Other elective'),
      free: tr('Serbest seçmeli', 'Free elective'),
    }
    if (map[t]) return map[t]
    // program_FIN / program_MGMT / ... -> "Program seçmeli (FIN)"
    if (t.startsWith('program_')) return `${tr('Program seçmeli', 'Program elective')} (${t.slice(8)})`
    return tr('Seçmeli', 'Elective')
  }

  const electiveTypeTone = (type) => {
    const key = String(type || '').toLocaleLowerCase('tr-TR')
    if (key.includes('sertifika') || key.includes('certificate')) return 'fit-et-certificate'
    if (key.includes('serbest') || key === 'free') return 'fit-et-free'
    if (key.includes('sosyal') || key.includes('social')) return 'fit-et-social'
    if (key.includes('dil') || key.includes('language')) return 'fit-et-language'
    if (key.includes('program')) return 'fit-et-program'
    if (key.includes('uzman') || key.includes('specialization')) return 'fit-et-specialization'
    if (key.includes('tasar') || key.includes('design')) return 'fit-et-design'
    if (key.includes('bitirme') || key.includes('finishing')) return 'fit-et-finishing'
    return 'fit-et-other'
  }

  // One fitting-course card (header + reqs + clipped section list).
  const renderFitCard = (course) => {
    const expanded = expandedFits.has(course.code)
    const shown = expanded ? course.sections : course.sections.slice(0, 4)
    const extra = course.sections.length - 4
    return (
      <div key={course.code} className="fit-course-card">
        <div className="fit-course-head">
          <div className="fit-course-info">
            <span className="fit-course-code">
              {course.code}
              {course.type === 'required' && (
                <span className="fit-type-tag fit-type-required">{tr('Zorunlu', 'Required')}</span>
              )}
              {course.type === 'elective' && (
                (course.electiveTypes && course.electiveTypes.length > 0)
                  ? course.electiveTypes.map(et => (
                    <span key={et} className={`fit-type-tag ${electiveTypeTone(et)}`}>{electiveTypeLabel(et)}</span>
                  ))
                  : <span className="fit-type-tag fit-type-elective">{tr('Seçmeli', 'Elective')}</span>
              )}
            </span>
            <span className="fit-course-name">{course.name}</span>
          </div>
          {course.sections.length > 1 && (
            <button className="btn btn-sm btn-ghost fit-add-all" onClick={() => addCourseToBasket(course, undefined, 'fitting')}>
              {tr('Tümünü Ekle', 'Add All')}
            </button>
          )}
        </div>

        <div className="fit-course-reqs">
          {course.coreq && (
            <span className="fit-req fit-req-coreq">
              <strong>{tr('Yan koşul:', 'Coreq:')}</strong> {course.coreq}
            </span>
          )}
          <span className="fit-req">
            <strong>{tr('Ön koşul:', 'Prereq:')}</strong> {course.prereq || '-'}
          </span>
        </div>

        <div className="fit-section-list">
          {shown.map(s => (
            <div key={s.section} className="fit-section-row">
              <span className="fit-section-name">{s.section.replace(course.code, '').trim() || s.section}</span>
            <span className="fit-section-times">
                {s.times.length > 0
                  ? s.times.map((t, index) => (
                    <span key={`${t.day}-${t.start}-${index}`}>
                      {dayAbbr[t.day] || t.day} {t.start}-{t.end}
                    </span>
                  ))
                  : <span>{tr('Açıklanmadı', 'TBA')}</span>}
              </span>
              <button className="btn btn-sm btn-secondary fit-add-section" onClick={() => addCourseToBasket(course, [s.section], 'fitting')}>
                {tr('Şube Ekle', 'Add Section')}
              </button>
            </div>
          ))}
          {course.sections.length > 4 && (
            <button className="fit-show-more" onClick={() => toggleFitExpand(course.code)}>
              {expanded ? tr('Daha az göster', 'Show less') : tr(`+${extra} şube daha göster`, `Show ${extra} more sections`)}
            </button>
          )}
        </div>
      </div>
    )
  }

  const totalCredits = basket.reduce((sum, c) => sum + c.credits, 0)
  const majorGroups = groupMajorOptions(majorsList, language)
  const selectedMajorLabel = majorGroups
    .flatMap(group => group.programs)
    .find(program => program.value === major)?.title
    || (major === 'master'
      ? tr('Yüksek Lisans', 'Master')
      : major === 'doctorate'
        ? tr('Doktora', 'Doctorate')
        : major === 'none'
          ? tr('Paylaşılmadı', 'Not shared')
          : '')

  return (
    <div className="app">
      {notice && (
        <div className={`toast toast-${notice.type}`} role="status">{notice.text}</div>
      )}
      {surveyNudgeVisible && (
        <SurveyNudge
          language={language}
          surveyUrl={siteSettings.surveyUrl}
          onFillSurvey={handleFillSurvey}
          onDismiss={dismissSurveyNudge}
        />
      )}
      {coreqPrompt && (
        <CorequisitePrompt
          prompt={coreqPrompt}
          language={language}
          onCancel={cancelCorequisiteWarning}
          onContinue={continueWithoutCorequisite}
          onAddCorequisite={addCorequisiteAndGenerate}
        />
      )}
      {auditOpen && (
        <DegreeAuditUpload
          language={language}
          result={auditResult}
          onResult={handleAuditResult}
          onClose={() => setAuditOpen(false)}
        />
      )}
      {activePage !== 'shared' && (
        <Header
          language={language}
          toggleLanguage={toggleLanguage}
          colorTheme={colorTheme}
          setColorTheme={selectColorTheme}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          activePage={activePage}
          onNavigate={navigate}
          onLogoClick={handleLogoClick}
          surveyUrl={siteSettings.surveyUrl}
        />
      )}

      {activePage !== 'shared' && (
        <ProfileBar
          language={language}
          majorLabel={selectedMajorLabel}
          grade={grade}
          onMajorClick={() => setMajorPromptReason('profile')}
          onGradeChange={saveGradePreference}
        />
      )}

      {activePage !== 'shared' && majorPromptReason && (
        <MajorPrompt
          language={language}
          groups={majorGroups}
          selectedMajor={major}
          onSelect={handleMajorPromptSelect}
          onClose={majorPromptReason === 'profile' ? () => setMajorPromptReason(null) : null}
        />
      )}

      {activePage === 'planner' && (
        <DinoGame
          active={dinoMode}
          open={dinoOpen}
          onOpen={() => setDinoOpen(true)}
          onClose={() => setDinoOpen(false)}
          language={language}
        />
      )}

      {activePage === 'shared' ? (
        <SharedSchedulePage id={sharedScheduleId} language={language} onHome={() => navigate('planner')} />
      ) : activePage === 'curriculum' ? (
        <CurriculumPage
          language={language}
          onAddCourse={addCourseToBasket}
          major={major}
          auditResult={auditResult}
        />
      ) : activePage === 'howto' ? (
        <HowToPage language={language} onNavigate={navigate} />
      ) : (
      <main className="main">
        <div className="main-layout">
          {/* Left: Search + Results */}
          <div className="main-content">
            <SearchSection
              language={language}
              onAddCourse={addCourseToBasket}
              catalogTerm={siteSettings.catalogTerm}
              basket={basket}
              onRemoveCourse={removeCourseFromBasket}
              onRemoveSection={removeSection}
              onExcludeSection={excludeSectionFromBasket}
            />

            {(schedules.length > 0 || genMessage) && (
              <section className="section generated-schedules" ref={generatedSchedulesRef}>
                <div className="section-header">
                  <h2>{language === 'tr' ? 'Oluşturulan Programlar' : 'Generated Schedules'}</h2>
                  {schedules.length > 0 && (
                    <span className="badge badge-purple">
                      {language === 'tr' ? `${schedules.length} program bulundu` : `${schedules.length} schedules found`}
                    </span>
                  )}
                </div>
                {genMessage && (
                  <div className="schedule-message">
                    <span>{genMessage}</span>
                    {freeDayFallback?.alternatives?.length > 0 && (
                      <div className="schedule-fallback-options">
                        <strong>
                          {tr(
                            'Şu günlerden birini seçerseniz boş gün bulunuyor:',
                            'A free day is available if you select one of these days:'
                          )}
                        </strong>
                        <div>
                          {freeDayFallback.alternatives.map(day => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                setFreeDays([day])
                                generateSchedules([day])
                              }}
                            >
                              {language === 'tr' ? day : (ENGLISH_DAY_NAMES[day] || day)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {generationInsights && (
                      <div className="conflict-insights">
                        {generationInsights.hardConflicts?.length > 0 ? (
                          <div className="conflict-insight-group">
                            <strong>{tr('Kesin çakışan dersler', 'Courses with unavoidable conflicts')}</strong>
                            <p>
                              {tr(
                                'Bu ders çiftlerinin mevcut şubeleri birbirleriyle mutlaka çakışıyor:',
                                'Every available section combination for these course pairs overlaps:'
                              )}
                            </p>
                            <ul className="conflict-pair-list">
                              {generationInsights.hardConflicts.map(pair => (
                                <li key={`${pair.courseA}-${pair.courseB}`}>
                                  <div>
                                    <span>{conflictCourseChip(pair.courseA)} <b aria-hidden="true">↔</b> {conflictCourseChip(pair.courseB)}</span>
                                    <small>
                                      {pair.sectionsA.join(', ')} <b aria-hidden="true">·</b> {pair.sectionsB.join(', ')}
                                    </small>
                                  </div>
                                  {pair.overlaps?.length > 0 && (
                                    <em>
                                      {pair.overlaps.map(time => `${language === 'tr' ? time.day : (ENGLISH_DAY_NAMES[time.day] || time.day)} ${time.start}–${time.end}`).join(', ')}
                                    </em>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : generationInsights.multiCourseInteraction ? (
                          <p className="conflict-combination-note">
                            {tr(
                              'Sorun tek bir ders çiftinden değil, birden fazla dersin şube kombinasyonundan kaynaklanıyor.',
                              'The problem is caused by the combined section choices of multiple courses, not one course pair.'
                            )}
                          </p>
                        ) : null}

                        {generationInsights.removalOptions?.length > 0 && (
                          <div className="conflict-insight-group conflict-solutions">
                            <strong>
                              {generationInsights.removalOptions[0].courses.length === 1
                                ? tr('Şunlardan birini çıkarırsanız program oluşabiliyor:', 'A schedule becomes possible if you remove one of these:')
                                : tr('Şu ikililerden birini çıkarırsanız program oluşabiliyor:', 'A schedule becomes possible if you remove one of these pairs:')}
                            </strong>
                            <div className="conflict-solution-list">
                              {generationInsights.removalOptions.map(option => (
                                <span className="conflict-solution-option" key={option.courses.join('-')}>
                                  {option.courses.map((code, index) => (
                                    <span key={code}>
                                      {index > 0 && <b aria-hidden="true"> + </b>}
                                      {conflictCourseChip(code)}
                                    </span>
                                  ))}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {schedules.length > 0 && (
                  <SchedulePreview
                    language={language}
                    schedules={schedules}
                    current={currentSchedule}
                    onPrev={() => { setCurrentSchedule(i => Math.max(0, i - 1)); setFittingShown(false); setScheduleShareCopied(false) }}
                    onNext={() => { setCurrentSchedule(i => Math.min(schedules.length - 1, i + 1)); setFittingShown(false); setScheduleShareCopied(false) }}
                    onShowFits={handleShowFitting}
                    onShare={handleShareSchedule}
                    sharing={sharingSchedule}
                    shareCopied={scheduleShareCopied}
                    onExportImage={handleExportSchedule}
                    exportingImage={exportingSchedule}
                    onExportCalendar={handleExportCalendar}
                    exportingCalendar={exportingCalendar}
                  />
                )}

                {/* Courses that fit this schedule — NEW v2 feature */}
                {schedules.length > 0 && (
                  <div className="fits-block" ref={fittingCoursesRef}>
                    <button className="btn btn-secondary fits-toggle" onClick={handleShowFitting} disabled={fittingLoading}>
                      {fittingLoading
                        ? (language === 'tr' ? 'Yükleniyor…' : 'Loading…')
                        : (language === 'tr' ? 'Programıma Uyan Dersleri Göster' : 'Show Courses That Fit This Schedule')}
                      <span className="badge badge-new">{language === 'tr' ? 'Yeni' : 'New'}</span>
                    </button>

                    {fittingShown && !isUndergraduateMajor(major) && (
                      <div className="fits-major-prompt">
                        <p>
                          {major === 'none'
                            ? (language === 'tr'
                              ? 'Programınıza uyan dersleri gösterebilmek için bölümünüzü bilmemiz gerekiyor.'
                              : 'We need to know your major to show courses that fit your program.')
                            : (language === 'tr'
                              ? 'Bölümünüzü seçin; programınıza uyan zorunlu ve seçmeli dersleri gösterelim.'
                              : 'Select your major and we will show required and elective courses that fit your schedule.')}
                        </p>
                        <select
                          className="fits-major-select"
                          value={isUndergraduateMajor(major) ? major : ''}
                          onChange={(e) => handleSelectMajor(e.target.value)}
                        >
                          <option value="">{language === 'tr' ? '-- Bölüm Seçin --' : '-- Select Major --'}</option>
                          {majorGroups.map(group => (
                            <optgroup key={group.id} label={group.label}>
                              {group.programs.map(program => (
                                <option key={program.value} value={program.value}>{program.label}</option>
                              ))}
                            </optgroup>
                          ))}
                          <option value="none">{language === 'tr' ? 'Paylaşmak istemiyorum' : "Don't want to share"}</option>
                        </select>
                      </div>
                    )}

                    {fittingShown && isUndergraduateMajor(major) && (
                      <>
                        <div className="fits-major-bar">
                          {language === 'tr' ? 'Bölüm:' : 'Major:'} <strong>{selectedMajorLabel}</strong>
                          <button className="fits-change-major" onClick={() => handleSelectMajor('')}>
                            {language === 'tr' ? 'Değiştir' : 'Change'}
                          </button>
                        </div>
                        {fittingLoading ? (
                          <p className="fits-empty">{language === 'tr' ? 'Yükleniyor…' : 'Loading…'}</p>
                        ) : fittingCourses.length === 0 ? (
                          <p className="fits-empty">
                            {language === 'tr' ? 'Bu programa uyan ders bulunamadı.' : 'No courses fit this schedule.'}
                          </p>
                        ) : (() => {
                          // Available filter options derived from the result.
                          const hasRequired = fittingCourses.some(c => c.type === 'required')
                          const typesPresent = []
                          for (const c of fittingCourses) {
                            for (const t of (c.electiveTypes || [])) {
                              if (!typesPresent.includes(t)) typesPresent.push(t)
                            }
                          }
                          const creditOptions = [...new Set(fittingCourses
                            .map(course => Number(course.credits))
                            .filter(Number.isFinite))]
                            .sort((a, b) => a - b)
                          // Apply the active filter.
                          const matchesFilter = (c) => {
                            const creditMatches = fitCreditFilter === 'all' || Number(c.credits) === Number(fitCreditFilter)
                            if (!creditMatches) return false
                            if (fitTypeFilter.size === 0) return true
                            if (c.type === 'required') return fitTypeFilter.has('required')
                            return (c.electiveTypes || []).some(t => fitTypeFilter.has(t))
                          }
                          const shown = fittingCourses.filter(matchesFilter)

                          const required = shown.filter(c => c.type === 'required')
                          const electives = shown.filter(c => c.type === 'elective')
                          const elecGroups = []
                          for (const c of electives) {
                            const faculty = c.faculty || tr('Diğer', 'Other')
                            let g = elecGroups.find(group => group.faculty === faculty)
                            if (!g) { g = { faculty, courses: [] }; elecGroups.push(g) }
                            g.courses.push(c)
                          }
                          const Group = ({ id, title, courses }) => {
                            const open = openFitGroups.has(id)
                            return (
                              <div
                                className={`fit-group ${open ? 'fit-group-open' : ''}`}
                                ref={node => {
                                  if (node) fittingGroupRefs.current.set(id, node)
                                  else fittingGroupRefs.current.delete(id)
                                }}
                              >
                                <button className="fit-group-header" onClick={() => toggleFitGroup(id)}>
                                  <span className="fit-group-title">{title} <span className="fit-group-count">{courses.length}</span></span>
                                  <svg className="fit-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                                </button>
                                {open && <div className="fits-courses-grid">{courses.map(renderFitCard)}</div>}
                              </div>
                            )
                          }
                          return (
                            <>
                              <div className="fits-warning">
                                {language === 'tr'
                                  ? 'Bu dersler programınıza saat olarak uyuyor. Bu dersi daha önce almış olabilir veya ön koşullarını sağlamıyor olabilirsiniz — lütfen kontrol edin.'
                                  : 'These courses fit your schedule time-wise. You may have already taken some, or may not meet the prerequisites — please verify.'}
                              </div>

                              {/* Elective-type filter chips */}
                              <div className="fit-filter-bar">
                                <span className="fit-filter-label">{tr('Filtre:', 'Filter:')}</span>
                                {hasRequired && (
                                  <button
                                    className={`fit-filter-chip ${fitTypeFilter.has('required') ? 'fit-filter-chip-active' : ''}`}
                                    onClick={() => toggleFitTypeFilter('required')}
                                  >{tr('Zorunlu', 'Required')}</button>
                                )}
                                {typesPresent.map(t => (
                                  <button key={t}
                                    className={`fit-filter-chip ${fitTypeFilter.has(t) ? 'fit-filter-chip-active' : ''}`}
                                    onClick={() => toggleFitTypeFilter(t)}
                                  >{electiveTypeLabel(t)}</button>
                                ))}
                                {fitTypeFilter.size > 0 && (
                                  <button className="fit-filter-clear" onClick={() => setFitTypeFilter(new Set())}>
                                    {tr('Temizle', 'Clear')}
                                  </button>
                                )}
                              </div>

                              <div className="fit-credit-filter" role="group" aria-label={tr('AKTS filtresi', 'ECTS filter')}>
                                <span className="fit-filter-label">{tr('AKTS:', 'ECTS:')}</span>
                                <button
                                  className={`fit-filter-chip ${fitCreditFilter === 'all' ? 'fit-filter-chip-active' : ''}`}
                                  onClick={() => setFitCreditFilter('all')}
                                >
                                  {tr('Tümü', 'All')}
                                </button>
                                {creditOptions.map(credit => (
                                  <button
                                    key={credit}
                                    className={`fit-filter-chip ${Number(fitCreditFilter) === credit ? 'fit-filter-chip-active' : ''}`}
                                    onClick={() => setFitCreditFilter(String(credit))}
                                  >
                                    {credit}
                                  </button>
                                ))}
                              </div>

                              {shown.length === 0 ? (
                                <p className="fits-empty">{tr('Seçilen filtreye uyan ders yok.', 'No courses match the selected filter.')}</p>
                              ) : (
                                <div className="fit-groups" ref={fittingResultsRef}>
                                  {required.length > 0 && (
                                    <Group id="required" title={tr('Zorunlu Dersler', 'Required Courses')} courses={required} />
                                  )}
                                  {elecGroups.map(g => (
                                    <Group key={g.faculty} id={`fac:${g.faculty}`}
                                      title={`${g.faculty} — ${tr('Seçmeli', 'Elective')}`}
                                      courses={g.courses} />
                                  ))}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

          </div>

          {/* Right: Basket Sidebar */}
          <aside className="sidebar">
            <BasketPanel
                basket={basket}
                setBasket={setBasket}
                removeSection={removeSection}
                totalCredits={totalCredits}
                language={language}
                savedBaskets={savedBaskets}
                setSavedBaskets={setSavedBaskets}
            />

            <div className="schedule-controls">
              <FreeDaySelector
                freeDays={freeDays}
                setFreeDays={setFreeDays}
                language={language}
              />

              <button className="btn btn-primary btn-generate" onClick={handleGenerate} disabled={generating}>
                {generating ? tr('Oluşturuluyor…', 'Generating…') : tr('Program Oluştur', 'Generate Schedules')}
              </button>
            </div>
          </aside>
        </div>
      </main>
      )}

      {activePage !== 'shared' && (
        <>
          <button
            type="button"
            className="mobile-basket-dock"
            onClick={() => setMobileBasketOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mobileBasketOpen}
          >
            <span className="mobile-basket-dock-copy">
              <strong>{tr('Sepetim', 'My Basket')}</strong>
              <span>{basket.length} {tr('ders', 'courses')} · {totalCredits} {tr('AKTS', 'ECTS')}</span>
            </span>
            <span className="mobile-basket-dock-action">{tr('Aç', 'Open')} <span aria-hidden="true">↑</span></span>
          </button>
          <p className="mobile-basket-footer">
            Designed and coded with <span>❤️</span> by{' '}
            <a href="https://github.com/faruk-avci" target="_blank" rel="noopener noreferrer">@omer-faruk-avci</a>
          </p>

          {mobileBasketOpen && (
            <div className="mobile-basket-backdrop" role="presentation" onMouseDown={() => setMobileBasketOpen(false)}>
              <section
                className="mobile-basket-sheet"
                role="dialog"
                aria-modal="true"
                aria-label={tr('Sepet ve program ayarları', 'Basket and schedule settings')}
                onMouseDown={event => event.stopPropagation()}
              >
                <div className="mobile-basket-sheet-handle" aria-hidden="true" />
                <div className="mobile-basket-sheet-header">
                  <div>
                    <strong>{tr('Programını hazırla', 'Prepare your schedule')}</strong>
                    <span>{tr('Derslerini ve boş günlerini kontrol et', 'Review courses and free days')}</span>
                  </div>
                  <button
                    type="button"
                    className="mobile-basket-close"
                    onClick={() => setMobileBasketOpen(false)}
                    aria-label={tr('Kapat', 'Close')}
                  >×</button>
                </div>
                <div className="mobile-basket-sheet-body">
                  <FreeDaySelector
                    freeDays={freeDays}
                    setFreeDays={setFreeDays}
                    language={language}
                  />
                  <BasketPanel
                    basket={basket}
                    setBasket={setBasket}
                    removeSection={removeSection}
                    totalCredits={totalCredits}
                    language={language}
                    savedBaskets={savedBaskets}
                    setSavedBaskets={setSavedBaskets}
                  />
                </div>
                <div className="mobile-basket-sheet-footer">
                  <button
                    className="btn btn-primary btn-generate"
                    onClick={() => {
                      if (activePage !== 'planner') navigate('planner')
                      handleGenerate()
                      setMobileBasketOpen(false)
                    }}
                    disabled={generating}
                  >
                    {generating ? tr('Oluşturuluyor…', 'Generating…') : tr('Program Oluştur', 'Generate Schedules')}
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      <footer className={`footer ${activePage !== 'shared' ? 'footer-mobile-basket' : ''}`}>
        <div className="container footer-content">
          <p className="footer-credit">
            UniPlanners · Designed and coded with <span>❤️</span> by{' '}
            <a href="https://github.com/faruk-avci" target="_blank" rel="noopener noreferrer" className="footer-link">
              @omer-faruk-avci
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
