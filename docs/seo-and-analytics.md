# Search and analytics setup

The production URL is `https://multiverse-benchmark.com/`. The build uses this
address by default; `VITE_SITE_URL` can override it if hosting changes.

## SEO already included

- Unique page titles and descriptions without release-specific task/tool counts.
- Canonical URLs, Open Graph and Twitter sharing metadata, and the existing logo.
- WebSite and WebPage structured data, with no invented publication details.
- A readable HTML introduction and page links before JavaScript runs.
- A generated `sitemap.xml` containing the main page and deep dive, plus
  `robots.txt` pointing to it. The coming-soon page stays `noindex`.

Publish the built site on the confirmed domain with HTTPS. In [Google Search
Console](https://search.google.com/search-console), add `multiverse-benchmark.com`
as a Domain property and complete its DNS verification. Submit
`https://multiverse-benchmark.com/sitemap.xml`, then inspect the homepage and deep
dive. DNS access and Search Console ownership are account setup steps; a build
does not complete them. For a URL-prefix property, an optional
`VITE_GOOGLE_SITE_VERIFICATION` value adds the HTML verification meta tag instead.

For GitHub Pages hosting, configure the custom domain in the repository's Pages
settings and add the DNS records GitHub supplies. For project-path hosting, keep
the full path in `VITE_SITE_URL`; submit the sitemap directly in Search Console
because a subdirectory's `robots.txt` does not control the domain root.

## Google Analytics 4

Analytics is on only when a measurement ID is supplied. Without one, no Google
tag loads and the analytics consent controls are not displayed.

1. Open [Google Analytics](https://analytics.google.com/) and create a property
   named **MultiVerse** (or select an existing property).
2. In **Admin → Data streams**, create a **Web** stream for
   `https://multiverse-benchmark.com` and copy its **Measurement ID**, beginning
   `G-`. No account password or API secret is needed by the website.
3. Copy `.env.example` to `.env.local` and set `VITE_GA_MEASUREMENT_ID` to the real
   ID. For the GitHub Actions deployment, set the repository Actions variable of
   the same name under **Settings → Secrets and variables → Actions → Variables**.
4. Rebuild and deploy.
5. Visit the final domain, choose **Allow analytics**, and check Analytics'
   **Realtime** report or [Tag Assistant](https://tagassistant.google.com/).
   Google's setup guide notes that collection can take up to 30 minutes to start.

When configured, a compact consent panel offers **Allow analytics** and
**Decline**. No Google code or requests are made before opt-in. **Analytics
settings** lets visitors change their choice; declining after opting in stops
collection and clears the usual GA cookies. Advertising consent stays denied,
and Google signals and ad-personalization signals are disabled. Analytics is
restricted to the configured production origin and site path, so a local
preview sends nothing to the property. The initial page-view URL excludes
query parameters and fragments. Review Enhanced Measurement settings in the GA
stream to choose which additional events you want collected.

## Official references

- [Google Analytics setup](https://support.google.com/analytics/answer/9304153?hl=en)
- [Google basic consent mode](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic)
- [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Building and submitting a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
