import type { HtmlTagDescriptor, Plugin } from 'vite';

// The confirmed public destination. VITE_SITE_URL also supports project-path hosting.
const PUBLIC_SITE_URL = 'https://multiverse-benchmark.com/';
const xmlEscape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

export function searchMetadata(env: Record<string, string>): Plugin {
  const site = new URL(env.VITE_SITE_URL || PUBLIC_SITE_URL);
  if (!['http:', 'https:'].includes(site.protocol) || site.search || site.hash || site.username || site.password) {
    throw new Error('VITE_SITE_URL must be an absolute HTTP(S) website URL, without query, fragment, or credentials.');
  }
  if (!site.pathname.endsWith('/')) site.pathname += '/';
  const measurementId = env.VITE_GA_MEASUREMENT_ID?.trim();
  if (measurementId && !/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error('VITE_GA_MEASUREMENT_ID must be a GA4 measurement ID beginning G-, or empty to disable Analytics.');
  }
  return {
    name: 'multiverse-search-metadata',
    transformIndexHtml(html, context) {
      if (context.filename.endsWith('coming-soon.html')) return html;
      const deepDive = context.filename.endsWith('deep-dive.html');
      const url = new URL(deepDive ? 'deep-dive.html' : '', site).href;
      const title = html.match(/<title>(.*?)<\/title>/)?.[1] || 'MultiVerse';
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] || '';
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'MultiVerse' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image', content: new URL('apple-touch-icon.png', site).href }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '180' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '180' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'MultiVerse service-orbit logo' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:title', content: title }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:description', content: description }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:image', content: new URL('apple-touch-icon.png', site).href }, injectTo: 'head' },
        { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': `${site.href}#website`, name: 'MultiVerse', url: site.href, inLanguage: 'en' },
            { '@type': 'WebPage', '@id': url, url, name: title, description, inLanguage: 'en', isPartOf: { '@id': `${site.href}#website` } },
          ],
        }).replace(/</g, '\\u003c'), injectTo: 'head' },
      ];
      if (env.VITE_GOOGLE_SITE_VERIFICATION?.trim()) {
        tags.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: env.VITE_GOOGLE_SITE_VERIFICATION.trim() }, injectTo: 'head' });
      }
      return { html, tags };
    },
    generateBundle() {
      const pages = [site.href, new URL('deep-dive.html', site).href];
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(url => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}\n</urlset>\n` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', site).href}\n` });
    },
  };
}
