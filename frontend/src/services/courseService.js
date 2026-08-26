/**
 * Course Catalog API / Service Layer (Direct PostgreSQL Backend Bridge)
 */

// API base URL. Empty = same-origin: works in dev via the Vite proxy and in
// production behind a reverse proxy. Set VITE_API_URL to target a different host.
const API_BASE = import.meta.env.VITE_API_URL || ''

export const courseService = {
  /**
   * Uploads a degree-audit PDF for server-side parsing against the current
   * curriculum data. Purely stateless on the backend — nothing is persisted
   * there; the caller decides whether to keep the result (e.g. localStorage).
   */
  async parseDegreeAudit(arrayBuffer, fileName) {
    const res = await fetch(API_BASE + '/api/degree-audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(fileName || 'audit.pdf'),
      },
      body: arrayBuffer,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'The PDF could not be parsed')
    return data
  },

  async getSiteSettings() {
    const res = await fetch(API_BASE + '/api/site-settings', { cache: 'no-store' })
    if (!res.ok) throw new Error('Site settings could not be loaded')
    return await res.json()
  },

  /**
   * Search courses by query and filters from the PostgreSQL database
   */
  async searchCourses(query = '', filters = {}) {
    const { major = '', programType = 'all' } = filters;
    
    try {
      const res = await fetch(API_BASE + '/api/courses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, major, type: programType }),
      });
      if (!res.ok) throw new Error('API request failed');

      return await res.json();
    } catch (err) {
      console.error('Failed to search courses from database:', err);
      return [];
    }
  },

  /**
   * Fetch unique program majors dynamically from the database
   */
  async getMajors() {
    try {
      const res = await fetch(API_BASE + '/api/majors');
      if (!res.ok) throw new Error('API request failed');
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch majors from database:', err);
      return [];
    }
  },

  async getPreferences() {
    const res = await fetch(API_BASE + '/api/preferences', { credentials: 'include' })
    if (!res.ok) throw new Error('Preferences could not be loaded')
    return await res.json()
  },

  async saveMajorPreference(major, source) {
    const res = await fetch(API_BASE + '/api/preferences/major', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ major, source }),
    })
    if (!res.ok) throw new Error('Major preference could not be saved')
    return await res.json()
  },

  async saveGradePreference(grade) {
    const res = await fetch(API_BASE + '/api/preferences/grade', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ grade }),
    })
    if (!res.ok) throw new Error('Grade preference could not be saved')
    return await res.json()
  },

  async getCurriculums() {
    const res = await fetch(API_BASE + '/api/curriculums');
    if (!res.ok) throw new Error('Curriculum list request failed');
    return await res.json();
  },

  async getCurriculum(id) {
    const res = await fetch(API_BASE + '/api/curriculums/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Curriculum request failed');
    return await res.json();
  },

  /**
   * Fetch a single course by exact code (e.g. "CS 201L" or "CS201L").
   * Cheap cached lookup — use instead of search when you know the code.
   * Returns the course object, or null if not found.
   */
  async getCourse(code) {
    const norm = String(code || '').replace(/\s+/g, '').toUpperCase()
    if (!norm) return null
    try {
      const res = await fetch(API_BASE + '/api/courses/' + encodeURIComponent(norm))
      if (!res.ok) return null
      return await res.json()
    } catch (err) {
      console.error('Failed to fetch course', norm, err)
      return null
    }
  },

  /**
   * Load the current session's saved basket from the server.
   * Relies on the HttpOnly session cookie (credentials: 'include').
   */
  async getBasket() {
    try {
      const res = await fetch(API_BASE + '/api/basket', { credentials: 'include' })
      if (!res.ok) throw new Error('Basket load failed')
      return await res.json()
    } catch (err) {
      console.error('Failed to load basket:', err)
      return []
    }
  },

  /**
   * Persist the whole basket for the current session.
   * @param {Array} items  [{ code, sections: [] }]
   */
  async saveBasket(items = []) {
    try {
      const res = await fetch(API_BASE + '/api/basket', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error('Basket save failed')
      return await res.json()
    } catch (err) {
      console.error('Failed to save basket:', err)
      return { success: false }
    }
  },

  async getSavedBaskets() {
    const res = await fetch(API_BASE + '/api/saved-baskets', { credentials: 'include' })
    if (!res.ok) throw new Error('Saved baskets could not be loaded')
    return await res.json()
  },

  async saveNamedBasket(name, items = []) {
    const res = await fetch(API_BASE + '/api/saved-baskets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name,
        items: items.map(item => ({
          code: item.code,
          sections: item.sections || [],
          source: item.source || null,
        })),
      }),
    })
    if (!res.ok) {
      const result = await res.json().catch(() => ({}))
      throw new Error(result.error || 'Basket could not be saved')
    }
    return await res.json()
  },

  async deleteSavedBasket(id) {
    const res = await fetch(API_BASE + '/api/saved-baskets/' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Saved basket could not be deleted')
    return await res.json()
  },

  async trackCourseAdd(code, source = 'search', selectionMode = 'course') {
    try {
      const res = await fetch(API_BASE + '/api/analytics/course-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({ code, source, selectionMode }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  /**
   * Fetch grading/assessment breakdown for a list of course codes.
   */
  async getAssessments(codes = []) {
    if (codes.length === 0) return {}
    try {
      const res = await fetch(API_BASE + '/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
      });
      if (!res.ok) throw new Error('API request failed');
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch assessments:', err);
      return {};
    }
  },

  /**
   * Generate conflict-free schedules from the basket, honoring free days.
   * @param {Array} basket  items with { code, selectedSection }
   * @param {Array} freeDays  full Turkish day names, e.g. ["Cuma"]
   */
  async generateSchedule(basket = [], freeDays = [], options = {}) {
    const courses = basket.map(item => ({
      code: item.code,
      sections: item.sections || [], // [] = all sections of the course
    }));

    try {
      const res = await fetch(API_BASE + '/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses, freeDays, ignoreCoreqs: Boolean(options.ignoreCoreqs) }),
      });
      if (!res.ok) throw new Error('Schedule generation failed');

      return await res.json();
    } catch (err) {
      console.error('Failed to generate schedules:', err);
      return { success: false, message: 'Network error', schedules: [], totalSchedules: 0 };
    }
  },

  /**
   * Fetch catalog courses that fit a chosen schedule (no time conflict).
   * @param {Array} occupied  the schedule's time slots [{day,start,end}]
   * @param {Array} excludeCodes  course codes already in the basket
   */
  async getFittingForSchedule(occupied = [], excludeCodes = [], major = '') {
    try {
      const res = await fetch(API_BASE + '/api/schedule/fitting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupied, exclude: excludeCodes, major }),
      });
      if (!res.ok) throw new Error('Fitting request failed');

      return await res.json();
    } catch (err) {
      console.error('Failed to fetch fitting courses:', err);
      return { success: false, courses: [], total: 0 };
    }
  },

  async shareSchedule(schedule, major = '') {
    const res = await fetch(API_BASE + '/api/shared-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ schedule, major }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Schedule could not be shared')
    return data
  },

  async exportScheduleImage(schedule, language = 'tr', layout = 'grid') {
    const res = await fetch(API_BASE + '/api/schedule/export-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule, language, layout }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Schedule image could not be created')
    }
    return await res.blob()
  },

  async exportScheduleCalendar(schedule, language = 'tr') {
    const res = await fetch(API_BASE + '/api/schedule/export-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule, language }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Calendar could not be created')
    }
    return await res.blob()
  },

  async getSharedSchedule(id) {
    const res = await fetch(API_BASE + '/api/shared-schedules/' + encodeURIComponent(id), {
      credentials: 'include',
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Shared schedule could not be loaded')
    return data
  },

  async getDinoLeaderboard(limit = 25) {
    const res = await fetch(`${API_BASE}/api/dino/leaderboard?limit=${encodeURIComponent(limit)}`)
    if (!res.ok) throw new Error('Dino leaderboard request failed')
    return await res.json()
  },

  async submitDinoScore(email, score) {
    const res = await fetch(API_BASE + '/api/dino/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, score }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Dino score request failed')
    return data
  },

  /**
   * Check which courses fit into a locked schedule (no time overlaps)
   * This operates locally on the current search results or can fetch
   */
  getFittingCourses(searchResults, lockedSections = []) {
    if (!searchResults || searchResults.length === 0) return [];
    
    // Collect all busy time slots from locked sections
    const busySlots = [];
    lockedSections.forEach(lockedSec => {
      // Find full section details in catalog
      const course = searchResults.find(c => lockedSec.name.startsWith(c.code));
      if (!course) return;
      const section = course.sections.find(s => s.name === lockedSec.name);
      if (section) {
        busySlots.push(...section.times);
      }
    });

    // Filter courses that have at least one section that does not overlap with busy slots
    return searchResults.filter(course => {
      // Don't suggest courses already in the basket/schedule
      if (lockedSections.some(sec => sec.name.startsWith(course.code))) {
        return false;
      }

      return course.sections.some(section => {
        return section.times.every(time => {
          return !busySlots.some(busy => {
            if (busy.day !== time.day) return false;
            return time.start < busy.end && busy.start < time.end;
          });
        });
      });
    });
  }
};
