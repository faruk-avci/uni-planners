/**
 * Course Catalog API / Service Layer (Direct PostgreSQL Backend Bridge)
 */

// API base URL. Empty = same-origin: works in dev via the Vite proxy and in
// production behind a reverse proxy. Set VITE_API_URL to target a different host.
const API_BASE = import.meta.env.VITE_API_URL || ''

export const courseService = {
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
   * @param {String} preference  'morning' | 'evening' | 'balanced'
   */
  async generateSchedule(basket = [], freeDays = [], preference = 'balanced') {
    const courses = basket.map(item => ({
      code: item.code,
      sections: item.sections || [], // [] = all sections of the course
    }));

    try {
      const res = await fetch(API_BASE + '/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses, freeDays, preference }),
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
