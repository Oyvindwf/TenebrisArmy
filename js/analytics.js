// Tenebris Army - GA4 Event Tracking (nav_click)
// Keep this file small, stable, and long-term maintainable.

(function () {
  function safeText(el) {
    return (el && el.textContent ? el.textContent.trim() : '') || '';
  }

  function normalizeLabel(text) {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  }

  document.addEventListener('click', function (e) {
    // Make sure GA is available
    if (typeof window.gtag !== 'function') return;

    // Track clicks in the NAV only
    const nav = e.target.closest('nav');
    if (!nav) return;

    // If user clicked the hamburger (or inside it), track it as nav interaction
    const hamburger = e.target.closest('.hamburger');
    if (hamburger) {
      window.gtag('event', 'nav_click', {
        nav_item: 'hamburger',
        nav_label: 'hamburger',
        nav_href: '(toggle)',
        nav_type: 'ui'
      });
      return;
    }

    // Track only actual link clicks in the nav
    const link = e.target.closest('a');
    if (!link || !nav.contains(link)) return;

    const href = link.getAttribute('href') || '';
    const labelRaw = safeText(link) || href || '(unknown)';
    const label = normalizeLabel(labelRaw);

    // Determine if it's a dropdown item
    const isDropdown = !!link.closest('.dropdown-content');
    const type = isDropdown ? 'dropdown' : 'primary';

    window.gtag('event', 'nav_click', {
      nav_item: label,
      nav_label: labelRaw,
      nav_href: href,
      nav_type: type
    });
  });
})();

// Track outbound link clicks site-wide (outbound_click)
(function () {
  function categorizeOutbound(url) {
    const u = url.toLowerCase();

    if (u.includes('spotify.com')) return 'spotify';
    if (u.includes('instagram.com')) return 'instagram';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('tiktok.com')) return 'tiktok';
    if (u.includes('elasticstage.com')) return 'merch';
    if (u.includes('spreadshirt')) return 'merch';
    if (u.includes('bandcamp.com')) return 'merch';
    return 'external';
  }

  document.addEventListener('click', function (e) {
    if (typeof window.gtag !== 'function') return;

    const link = e.target.closest('a');
    if (!link) return;

    // Ignore non-http links (mailto:, tel:, #anchors)
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    // Resolve to absolute URL
    let url;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    const isExternal = url.hostname !== window.location.hostname;
    if (!isExternal) return;

    const category = categorizeOutbound(url.href);

    window.gtag('event', 'outbound_click', {
      outbound_category: category,
      outbound_url: url.href,
      outbound_text: (link.textContent || '').trim().slice(0, 100)
    });
  });
})();
