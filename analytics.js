/* Consistent event context. Acquisition links never modify commercial affiliate URLs. */
(() => {
  'use strict';
  const safe = value => String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
  const params = new URLSearchParams(location.search);
  const qa = params.get('pn_qa') === '1';
  let referrer = '';
  try { referrer = new URL(document.referrer).hostname.toLowerCase(); } catch (_) {}
  const ownHost = location.hostname.toLowerCase();
  const utmSource = safe(params.get('utm_source')).toLowerCase();
  let source = utmSource || (/^(?:www\.)?google\./.test(referrer) ? 'google' : /^(?:www\.)?(x\.com|twitter\.com|t\.co)$/.test(referrer) ? 'x' : referrer && referrer !== ownHost ? 'referral' : 'direct');
  let medium = safe(params.get('utm_medium')) || (source === 'google' ? 'organic' : source === 'x' ? 'social' : source === 'referral' ? 'referral' : 'none');
  let campaign = safe(params.get('utm_campaign'));
  try {
    const previous = JSON.parse(sessionStorage.getItem('promo-acquisition') || 'null');
    if (!utmSource && referrer === ownHost && previous) ({source, medium, campaign} = previous);
    else sessionStorage.setItem('promo-acquisition', JSON.stringify({source, medium, campaign}));
  } catch (_) {}
  const pageType = location.pathname.startsWith('/produto/') ? 'product' : location.pathname.startsWith('/guias/') ? 'guide' : 'catalog';
  const productId = pageType === 'product' ? location.pathname.split('/').pop().replace(/\.html$/, '') : '';
  function track(name, values = {}) {
    const data = {...values, acquisition_source: safe(source), acquisition_medium: safe(medium), campaign_name: safe(campaign),
      page_type: pageType, page_path: location.pathname, item_id: values.item_id || productId, transport_type: 'beacon'};
    if (data.link_url) {
      try {
        const target = new URL(data.link_url, location.href);
        data.destination = target.hostname;
        if (name === 'click_offer' && target.hostname === location.hostname) name = 'view_current_offers';
        if (name === 'click_social' && target.hostname === 't.me') data.social_action = target.pathname.startsWith('/share/') ? 'share_offer' : 'open_channel';
        // Store destination path only; query strings can contain account-specific data.
        data.link_url = target.origin + target.pathname;
      } catch (_) { delete data.link_url; }
    }
    if (qa) {
      let output = document.getElementById('analytics-validation');
      if (!output) {
        output = document.createElement('pre');
        output.id = 'analytics-validation';
        output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#fff;color:#111;font-size:12px';
        output.setAttribute('aria-live', 'polite');
        document.body.appendChild(output);
      }
      output.textContent = JSON.stringify({event:name,params:data,mode:'validation-no-event-sent'}, null, 2);
      return;
    }
    if (typeof window.gtag === 'function') window.gtag('event', name, data);
  }
  window.PromoNinjaAnalytics = {track};
  let inviteLinks = {};
  const origin = source === 'google' ? 'google' : ['x','twitter','t.co'].includes(source) ? 'x' : 'site';
  function updateInvite(anchor) {
    if (!anchor) return;
    const link = inviteLinks[origin];
    if (link && /^https:\/\/t\.me\/\+[A-Za-z0-9_-]+$/.test(link)) anchor.href = link;
    anchor.dataset.acquisitionOrigin = origin;
  }
  fetch('/telegram-invites.json').then(response => response.ok ? response.json() : {}).then(links => {
    inviteLinks = links;
    document.querySelectorAll('a[href="https://t.me/promoninjaofertas"]').forEach(updateInvite);
  }).catch(() => {});
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    if (link.href === 'https://t.me/promoninjaofertas' || link.dataset.acquisitionOrigin) {
      updateInvite(link);
      // Guide pages have no legacy click listener; other templates keep their event names.
      if (pageType === 'guide') track('click_social', {link_url:link.href,link_text:'Telegram',placement:'guide'});
    }
    if (qa && (link.matches('.buy-button,.cta,.mobile-cta') || link.dataset.acquisitionOrigin)) event.preventDefault();
  }, true);
})();
