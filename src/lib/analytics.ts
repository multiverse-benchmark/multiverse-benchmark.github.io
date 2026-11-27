import './analytics.css';

// Loading this local module does not contact Google. A configured production
// origin and an explicit visitor opt-in are both required to load the tag.
const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || '';
const publicUrl = new URL(import.meta.env.VITE_SITE_URL || 'https://multiverse-benchmark.com/');
const sitePath = publicUrl.pathname.endsWith('/') ? publicUrl.pathname : `${publicUrl.pathname}/`;
const consentKey = 'multiverse-analytics-consent-v1';
type Consent = 'granted' | 'denied' | null;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function installAnalyticsControls() {
  const analyticsWindow = window as AnalyticsWindow;
  let loaded = false;
  let consent: Consent = null;
  try {
    const saved = localStorage.getItem(consentKey);
    if (saved === 'granted' || saved === 'denied') consent = saved;
  } catch { /* The visitor can still opt in for this page. */ }

  function startAnalytics() {
    if (loaded) return;
    loaded = true;
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
    analyticsWindow.gtag = function (..._args: unknown[]) { analyticsWindow.dataLayer!.push(arguments); };
    const gtag = analyticsWindow.gtag;
    gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: `${location.origin}${location.pathname}`,
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  const panel = document.createElement('section');
  panel.className = 'analytics-consent';
  panel.setAttribute('aria-label', 'Optional analytics');
  panel.innerHTML = '<p>Allow Google Analytics to measure visits? This uses analytics cookies and shares usage data with Google. No advertising features.</p><div class="analytics-consent-actions"><button type="button" data-consent="granted">Allow analytics</button><button type="button" data-consent="denied">Decline</button></div>';

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'analytics-settings';
  settings.textContent = 'Analytics settings';
  settings.addEventListener('click', () => {
    settings.hidden = true;
    panel.hidden = false;
    panel.querySelector<HTMLButtonElement>('button')?.focus();
  });

  function choose(next: Exclude<Consent, null>) {
    consent = next;
    try { localStorage.setItem(consentKey, next); } catch { /* Keep this page's choice. */ }
    panel.hidden = true;
    settings.hidden = false;
    settings.focus();
    if (next === 'granted') startAnalytics();
    else if (loaded) {
      // Reload after withdrawal to unload the Google code and stop all later events.
      (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = true;
      const domains = location.hostname.split('.').map((_, index, parts) => parts.slice(index).join('.'));
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.trim().split('=')[0];
        if (name !== '_ga' && !name.startsWith('_ga_')) continue;
        document.cookie = `${name}=; Max-Age=0; path=/`;
        for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
      }
      location.reload();
    }
  }

  panel.querySelectorAll<HTMLButtonElement>('[data-consent]').forEach(button => {
    button.addEventListener('click', () => choose(button.dataset.consent as Exclude<Consent, null>));
  });
  panel.hidden = consent !== null;
  settings.hidden = consent === null;
  document.body.append(panel, settings);
  if (consent === 'granted') startAnalytics();
}

if (import.meta.env.PROD && /^G-[A-Z0-9]+$/.test(measurementId)
  && location.origin === publicUrl.origin && location.pathname.startsWith(sitePath)) {
  installAnalyticsControls();
}
