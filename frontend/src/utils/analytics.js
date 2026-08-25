// Generic analytics tracker

export async function trackEvent(category, action, label = null, data = null) {
  try {
    const API_BASE = import.meta.env.VITE_API_URL || '';

    await fetch(`${API_BASE}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ category, action, label, data }),
    });
  } catch (error) {
    console.error('Failed to track event:', category, action, error);
  }
}
