/* ==========================================================================
   PROMO NINJA — App do catálogo
   --------------------------------------------------------------------------
   Vanilla JS, sem dependências. Vive no repositório (a automação da VPS não
   sobrescreve /assets), então pode ser editado sem mexer no gerador.

   Arquitetura
   - O gerador imprime os cards no HTML (SSR) para SEO e primeiro paint.
   - Este script busca /catalog.json e re-renderiza o grid com os mesmos
     nomes de classe. Se o fetch falhar, os cards do SSR continuam válidos.
   - Loja e categoria principal são NAVEGAÇÃO (URLs reais e indexáveis).
     Preço, desconto, cupom, atualização e ordenação são filtros de cliente,
     sem criar URL nova — evita gerar páginas infinitas para o crawler.

   IMPORTANTE: a marcação de `renderCard()` precisa ficar idêntica à de
   `_static_offer_card()` em config/build-seo-pages.py (VPS), senão o card
   muda de aparência quando o JS assume o grid.
   ========================================================================== */
(() => {
  'use strict';

  const SITE_URL = 'https://promoninjaofertas.github.io';
  const MAX_AGE_HOURS = 24;
  const PAGE_SIZE = 24;

  /* ---------------------------------------------------------------- Ícones */
  const ICON = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12V7a7 7 0 0 1 14 0v5"/><path d="M3 12h18l-1.5 8h-15L3 12Z"/></svg>',
    external:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5l8-3Zm-1 13 5-5-1.4-1.4-3.6 3.6-1.6-1.6L8 12l3 3Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  /* ----------------------------------------------------------- Utilitários */
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const escapeHtml = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      char =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
    );

  /** Só aceita https. Qualquer outra coisa vira o fallback — nunca "undefined". */
  const safeUrl = (value, fallback = '#') =>
    /^https:\/\//i.test(String(value || '')) ? String(value) : fallback;

  /* --------------------------------------------------------------- Imagens
     Espelho de services/site_images.py (VPS) — mantenha os dois em sincronia.
     Direto da loja (tamanho pedido à CDN quando suportado) -> proxy weserv ->
     placeholder. O proxy sozinho quebrava as imagens do Pechinchou (403).     */
  const CARD_IMAGE_SIZE = 480;
  const IMAGE_ONERROR =
    "var p=this.parentElement,f=this.getAttribute('data-fallback');" +
    "if(f){this.removeAttribute('data-fallback');this.src=f;}" +
    "else{this.remove();if(p)p.classList.add('no-image');}";

  const proxyImageUrl = url =>
    'https://images.weserv.nl/?url=' +
    encodeURIComponent('ssl:' + url.replace(/^https?:\/\//, '')) +
    '&w=1100&h=950&fit=contain&output=webp';

  function resizedImageUrl(url, size) {
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch (_) {
      return url;
    }
    if (host.endsWith('media-amazon.com'))
      return url.replace(
        /(\/images\/I\/[^./]+)(?:\.[^/]*?)?(\.(?:jpe?g|png|webp))$/,
        `$1._SL${size}_$2`
      );
    if (host.endsWith('aliexpress-media.com') || host.endsWith('alicdn.com')) {
      const base = url.replace(/(\.jpe?g)_\d+x\d+(?:q\d+)?\.jpe?g$/i, '$1');
      if (/\.jpe?g$/i.test(base)) return `${base}_${size}x${size}.jpg`;
    }
    return url;
  }

  function imageTag(url, { size, width, height, alt = '' }) {
    if (!/^https:\/\//i.test(String(url || ''))) return '';
    return (
      `<img src="${escapeHtml(resizedImageUrl(url, size))}" ` +
      `data-fallback="${escapeHtml(proxyImageUrl(url))}" alt="${escapeHtml(alt)}" ` +
      `width="${width}" height="${height}" loading="lazy" decoding="async" ` +
      `referrerpolicy="no-referrer" onerror="${IMAGE_ONERROR}">`
    );
  }

  const money = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '';
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const STORE_NAMES = {
    amazon: 'Amazon',
    aliexpress: 'AliExpress',
    shopee: 'Shopee',
    mercadolivre: 'Mercado Livre'
  };
  const STORE_PATHS = {
    amazon: '/ofertas/amazon/',
    aliexpress: '/ofertas/aliexpress/',
    shopee: '/ofertas/shopee/',
    mercadolivre: '/ofertas/mercado-livre/'
  };
  const storeName = value =>
    STORE_NAMES[String(value || '').toLowerCase()] || String(value || 'Oferta');

  const toDate = value => {
    if (!value) return null;
    const text = String(value).trim();
    const parsed = new Date(
      /(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text.replace(' ', 'T')}Z`
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const ageHours = value => {
    const date = toDate(value);
    return date ? (Date.now() - date.getTime()) / 3600000 : Infinity;
  };

  function relativeTime(value) {
    const date = toDate(value);
    if (!date) return '';
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 60) return minutes <= 1 ? 'agora há pouco' : `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'ontem' : `há ${days} dias`;
  }

  function track(name, params = {}) {
    if (window.PromoNinjaAnalytics) window.PromoNinjaAnalytics.track(name, params);
    else if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /* ---------------------------------------------------------------- Toasts */
  const toastRegion = (() => {
    let region = $('#toastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toastRegion';
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  })();

  function toast(message, variant = 'success') {
    const element = document.createElement('div');
    element.className = `toast${variant === 'error' ? ' is-error' : ''}`;
    element.innerHTML =
      (variant === 'error' ? ICON.alert : ICON.check) + `<span>${escapeHtml(message)}</span>`;
    toastRegion.appendChild(element);
    setTimeout(() => {
      element.classList.add('is-leaving');
      setTimeout(() => element.remove(), 220);
    }, 2600);
  }

  /* ------------------------------------------------------- Header e scroll */
  const header = $('.pn-header');
  const toTop = $('#toTop');

  const onScroll = () => {
    const y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (toTop) toTop.classList.toggle('is-visible', y > 700);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', () => {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  /* -------------------------------------------- Diálogos (menu/busca/sheet)
     Foco preso, Esc fecha, scroll travado e foco devolvido ao gatilho.       */
  function createDialog(element, { onOpen } = {}) {
    if (!element) return null;
    let lastFocused = null;

    const focusables = () =>
      $$(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
        element
      ).filter(node => node.offsetParent !== null);

    function open() {
      lastFocused = document.activeElement;
      element.classList.add('is-open');
      element.removeAttribute('aria-hidden');
      document.body.classList.add('no-scroll');
      if (onOpen) onOpen();
      // Reflow síncrono em vez de rAF: rAF é estrangulado em aba de fundo e o
      // foco acabaria caindo em um elemento ainda invisível.
      void element.offsetHeight;
      const first = focusables()[0] || $('.mobile-menu-panel,.sheet-panel', element) || element;
      first.focus({ preventScroll: true });
    }

    function close() {
      element.classList.remove('is-open');
      element.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      lastFocused?.focus();
    }

    element.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    $$('[data-close]', element).forEach(node => node.addEventListener('click', close));
    element.setAttribute('aria-hidden', 'true');
    return { open, close, element };
  }

  const mobileMenu = createDialog($('#mobileMenu'));
  const searchOverlay = createDialog($('#searchOverlay'));
  const filterSheet = createDialog($('#filterSheet'));

  $('#menuToggle')?.addEventListener('click', () => mobileMenu?.open());
  $('#searchToggle')?.addEventListener('click', () => searchOverlay?.open());

  /* ------------------------------------------------- CTA fixo (produto) */
  const mobileCta = $('.mobile-cta');
  if (mobileCta) {
    const syncCta = () => mobileCta.classList.toggle('visible', window.scrollY > 320);
    addEventListener('scroll', syncCta, { passive: true });
    syncCta();
  }

  /* ---------------------------------------------- Handlers universais
     Valem em qualquer página (catálogo, produto, guia, quem somos): copiar
     cupom, copiar link, e os eventos de clique em oferta e redes.          */
  document.addEventListener('click', event => {
    const target = event.target;

    const copy = target.closest('[data-coupon]');
    if (copy) {
      event.preventDefault();
      const code = copy.dataset.coupon;
      track('copy_coupon', { coupon_code: code });
      const label = $('span', copy);
      navigator.clipboard
        ?.writeText(code)
        .then(() => {
          copy.classList.add('is-copied');
          if (label) label.textContent = 'Copiado';
          toast(`Cupom ${code} copiado.`);
          setTimeout(() => {
            copy.classList.remove('is-copied');
            if (label) label.textContent = 'Copiar';
          }, 2200);
        })
        .catch(() => toast('Não foi possível copiar o cupom.', 'error'));
      return;
    }

    const copyLink = target.closest('[data-copy]');
    if (copyLink) {
      event.preventDefault();
      const url = copyLink.dataset.copy;
      track('copy_product_link', { link_url: url });
      navigator.clipboard
        ?.writeText(url)
        .then(() => toast('Link copiado.'))
        .catch(() => toast('Não foi possível copiar o link.', 'error'));
      return;
    }

    const buy = target.closest('.buy-button,.product-cta,.mobile-cta');
    if (buy) {
      const placement = buy.classList.contains('mobile-cta')
        ? 'product_mobile'
        : buy.classList.contains('product-cta')
          ? 'product_main'
          : 'catalog_card';
      track('click_offer', {
        store: buy.dataset.store || '',
        item_name: buy.dataset.title || '',
        item_id: buy.dataset.itemId || '',
        placement,
        link_url: buy.href
      });
    }

    const related = target.closest('.related-card');
    if (related)
      track('click_related_product', {
        item_name: related.dataset.title || '',
        link_url: related.href || ''
      });

    const social = target.closest(
      '.footer-social a,.header-telegram,.floating-telegram,.share-row a,.channel-cta,' +
        '.hero-actions a[href*="t.me"],.mobile-menu-foot a'
    );
    if (social)
      track('click_social', {
        link_text: (social.textContent || social.getAttribute('aria-label') || '').trim(),
        link_url: social.href || ''
      });

    const couponLink = target.closest('.coupon-card');
    if (couponLink)
      track('click_coupon', {
        store: couponLink.dataset.store || '',
        placement: 'coupon_page',
        link_url: couponLink.href
      });

    const storeCard = target.closest('.store-card');
    if (storeCard) track('filter_store', { store: storeCard.dataset.storeLabel || '' });
  });

  /* ======================================================================
     CATÁLOGO
     ====================================================================== */
  const grid = $('#grid');
  const resultCount = $('#resultCount');

  if (!grid) {
    // Páginas sem catálogo (quem somos, guias, 404): a busca leva para a home.
    $$('.search-input').forEach(input => {
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const term = input.value.trim();
        if (term) location.href = `/?q=${encodeURIComponent(term)}`;
      });
    });
    return;
  }

  const body = document.body;
  const lockedStore = body.dataset.store || '';
  const lockedCategory = body.dataset.category || '';
  const lockedQuery = body.dataset.query || '';
  const isHome = !lockedStore && !lockedCategory && !lockedQuery;
  // /categorias/cupons.html e /cupons/<loja>/: só cupons, sem produtos.
  const isCouponPage = lockedCategory === 'Cupons';

  // Busca vinda do Google (SearchAction do schema) ou de outra página do site.
  const initialQuery = new URLSearchParams(location.search).get('q') || '';

  const PRICE_RANGES = {
    '0-50': { label: 'Até R$ 50', min: 0, max: 50 },
    '50-150': { label: 'R$ 50 a R$ 150', min: 50, max: 150 },
    '150-300': { label: 'R$ 150 a R$ 300', min: 150, max: 300 },
    '300-700': { label: 'R$ 300 a R$ 700', min: 300, max: 700 },
    '700+': { label: 'Acima de R$ 700', min: 700, max: Infinity }
  };

  const state = {
    category: 'Todas',
    query: lockedQuery || initialQuery,
    price: '',
    discount: 0,
    couponOnly: lockedCategory === 'Cupons',
    recentOnly: false,
    order: 'recentes',
    visible: PAGE_SIZE
  };

  if (initialQuery && !lockedQuery) {
    $$('.search-input').forEach(input => {
      input.value = initialQuery;
    });
  }

  let allOffers = [];
  let loaded = false;

  /* -------------------------------------------------------- Classificação */
  function categoryGroup(offer) {
    if (offer.grupo) return offer.grupo;
    const text = `${offer.categoria || ''} ${offer.titulo || ''}`.toLowerCase();
    if (/gamer|gaming|playstation|xbox|nintendo|console|gamepad|controle|joystick/.test(text))
      return 'Gamer';
    if (/moda|beleza|perfume|maquiagem|tenis|camiseta|vestido|mochila|oculos|relogio/.test(text))
      return 'Moda';
    if (
      /casa|cozinha|eletrodom|utilidades|air ?fryer|fritadeira|panela|aspirador|geladeira|cafeteira|pet|cachorro|gato/.test(
        text
      )
    )
      return 'Casa';
    if (
      /hardware|informatica|impressora|multifuncional|ecotank|notebook|roteador|smartphone|audio|eletron|ssd|nvme|memoria|teclado|mouse|headset|fone|monitor|camera|projetor|tv|usb|cooler|ventoinha/.test(
        text
      )
    )
      return 'Tech';
    return 'Outros';
  }

  /** Desconto só é confiável quando existe um "de" maior que o "por". */
  const hasRealOldPrice = offer =>
    Number(offer.de) > Number(offer.por) && Number(offer.por) > 0;

  const isHighlighted = offer =>
    String(offer.loja).toLowerCase() === 'shopee'
      ? Boolean(offer.price_evidence && offer.price_evidence.advantage)
      : Number(offer.desconto || 0) >= 35;

  /* ------------------------------------------------------------ Filtragem */
  function matchesPageScope(offer) {
    if (lockedStore && storeName(offer.loja) !== lockedStore) return false;
    if (lockedQuery) {
      const haystack = `${offer.titulo || ''} ${offer.categoria || ''}`.toLowerCase();
      if (!lockedQuery.toLowerCase().split(/\s+/).every(token => haystack.includes(token)))
        return false;
    }
    if (lockedCategory === 'Cupons') return Boolean(offer.cupom);
    if (lockedCategory === 'Destaques') return isHighlighted(offer);
    if (lockedCategory && lockedCategory !== 'Todas' && offer.group !== lockedCategory)
      return false;
    return true;
  }

  function matchesFilters(offer) {
    if (state.category !== 'Todas' && offer.group !== state.category) return false;
    if (state.couponOnly && !offer.cupom) return false;
    if (state.recentOnly && ageHours(offer.data) > 12) return false;
    if (state.discount && Number(offer.desconto || 0) < state.discount) return false;
    if (state.price) {
      const range = PRICE_RANGES[state.price];
      const price = Number(offer.por || 0);
      if (range && (price < range.min || price > range.max)) return false;
    }
    if (state.query) {
      const haystack =
        `${offer.titulo || ''} ${offer.marca || ''} ${offer.categoria || ''} ${offer.storeLabel}`.toLowerCase();
      if (!state.query.toLowerCase().split(/\s+/).every(token => haystack.includes(token)))
        return false;
    }
    return true;
  }

  function sortOffers(offers) {
    const sorted = [...offers];
    switch (state.order) {
      case 'desconto':
        return sorted.sort((a, b) => Number(b.desconto || 0) - Number(a.desconto || 0));
      case 'menor-preco':
        return sorted.sort((a, b) => Number(a.por || 0) - Number(b.por || 0));
      case 'maior-preco':
        return sorted.sort((a, b) => Number(b.por || 0) - Number(a.por || 0));
      case 'economia':
        return sorted.sort(
          (a, b) =>
            (hasRealOldPrice(b) ? b.de - b.por : 0) - (hasRealOldPrice(a) ? a.de - a.por : 0)
        );
      default:
        return sorted.sort((a, b) => (toDate(b.data) || 0) - (toDate(a.data) || 0));
    }
  }

  const scopedOffers = () => allOffers.filter(matchesPageScope);
  const filteredOffers = () => sortOffers(scopedOffers().filter(matchesFilters));

  /* ------------------------------------------------------------ Marcação */
  function renderCoupon(offer) {
    if (!offer.cupom) return '';
    const code = escapeHtml(offer.cupom);
    return `<div class="coupon">
      <span class="coupon-label">Cupom</span>
      <span class="coupon-code">${code}</span>
      <button type="button" class="coupon-copy" data-coupon="${code}" aria-label="Copiar cupom ${code}">${ICON.copy}<span>Copiar</span></button>
    </div>`;
  }

  function renderCard(offer) {
    const page = safeUrl(offer.page_url || offer.link, SITE_URL);
    const link = safeUrl(offer.link, page);
    const title = escapeHtml(offer.titulo || 'Oferta selecionada');
    const image = imageTag(safeUrl(offer.imagem, ''), { size: CARD_IMAGE_SIZE, width: 300, height: 300 });
    const discount = Number(offer.desconto || 0);
    const posted = relativeTime(offer.data);

    return `<article class="card" data-store="${escapeHtml(offer.loja)}">
      <div class="card-top">
        <span class="store">${escapeHtml(offer.storeLabel)}</span>
        ${posted ? `<span class="posted">${escapeHtml(posted)}</span>` : ''}
      </div>
      <a class="product-image${image ? '' : ' no-image'}" href="${page}" tabindex="-1" aria-hidden="true">
        ${discount > 0 ? `<span class="discount">-${discount}%</span>` : ''}
        ${image}
      </a>
      <div class="card-body">
        <a class="product-title-link" href="${page}"><h3 class="product-title">${title}</h3></a>
        ${renderCoupon(offer)}
        <div class="prices">
          ${hasRealOldPrice(offer) ? `<span class="old-price">${money(offer.de)}</span>` : ''}
          <strong class="current-price">${money(offer.por) || 'Preço na loja'}</strong>
        </div>
        <span class="verified">${ICON.shield}Confira as condições na loja</span>
        <a class="buy-button" href="${link}" target="_blank" rel="nofollow sponsored noopener"
           data-store="${escapeHtml(offer.storeLabel)}" data-title="${title}"
           data-item-id="${escapeHtml(offer.slug || offer.source_id || '')}">Ver oferta ${ICON.external}</a>
      </div>
    </article>`;
  }

  function renderSkeletons(count = 8) {
    return Array.from(
      { length: count },
      () => `<div class="skeleton-card" aria-hidden="true">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line price"></div>
        <div class="skeleton skeleton-button"></div>
      </div>`
    ).join('');
  }

  /* -------------------------------------------------------- Filtros ativos */
  function activeFilterChips() {
    const chips = [];
    if (lockedStore)
      chips.push({ label: lockedStore, href: '/', type: 'loja' });
    if (lockedCategory && lockedCategory !== 'Todas')
      chips.push({ label: lockedCategory, href: '/', type: 'categoria' });
    if (state.category !== 'Todas')
      chips.push({ label: state.category, key: 'category', reset: 'Todas' });
    if (state.price)
      chips.push({ label: PRICE_RANGES[state.price].label, key: 'price', reset: '' });
    if (state.discount)
      chips.push({ label: `${state.discount}% ou mais`, key: 'discount', reset: 0 });
    if (state.couponOnly && lockedCategory !== 'Cupons')
      chips.push({ label: 'Com cupom', key: 'couponOnly', reset: false });
    if (state.recentOnly)
      chips.push({ label: 'Últimas 12h', key: 'recentOnly', reset: false });
    if (state.query && !lockedQuery)
      chips.push({ label: `"${state.query}"`, key: 'query', reset: '' });
    return chips;
  }

  const clientFilterCount = () =>
    activeFilterChips().filter(chip => chip.key).length;

  function renderChips() {
    const container = $('#activeFilters');
    if (!container) return;
    const chips = activeFilterChips();
    if (!chips.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML =
      chips
        .map(chip =>
          chip.href
            ? `<a class="chip" href="${chip.href}">${escapeHtml(chip.label)}<span aria-hidden="true">${ICON.close}</span><span class="sr-only">Remover filtro de ${chip.type}</span></a>`
            : `<span class="chip">${escapeHtml(chip.label)}<button type="button" data-clear="${chip.key}" aria-label="Remover filtro ${escapeHtml(chip.label)}">${ICON.close}</button></span>`
        )
        .join('') +
      (chips.some(chip => chip.key)
        ? '<button type="button" class="chip-clear" data-clear-all>Limpar filtros</button>'
        : '');
  }

  /* ------------------------------------------------------- Seções da home */
  function renderSection(id, offers, minimum) {
    const section = document.getElementById(id);
    if (!section) return;
    const container = $('.grid', section);
    if (!container || offers.length < minimum) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    container.innerHTML = offers.map(renderCard).join('');
  }

  function renderCuratedSections() {
    if (!isHome) return;
    const pool = scopedOffers();
    const untouched = clientFilterCount() === 0;

    // Com filtro ativo, as seções curadas saem de cena: o usuário está buscando.
    if (!untouched) {
      ['sectionHunt', 'sectionCoupons', 'sectionDiscounts'].forEach(id => {
        const node = document.getElementById(id);
        if (node) node.hidden = true;
      });
      return;
    }

    const hunt = [...pool]
      .filter(offer => hasRealOldPrice(offer) && Number(offer.desconto || 0) >= 25)
      .sort(
        (a, b) =>
          Number(b.nota_qualidade || 0) - Number(a.nota_qualidade || 0) ||
          Number(b.desconto || 0) - Number(a.desconto || 0)
      )
      .slice(0, 4);
    renderSection('sectionHunt', hunt, 4);

    const coupons = pool.filter(offer => offer.cupom).slice(0, 4);
    renderSection('sectionCoupons', coupons, 3);

    const discounts = [...pool]
      .filter(hasRealOldPrice)
      .sort((a, b) => Number(b.desconto || 0) - Number(a.desconto || 0))
      .slice(0, 8);
    renderSection('sectionDiscounts', discounts, 4);
  }

  /* ------------------------------------------------------ Página de cupons
     Só cupons, sem produto, com o código parcialmente oculto. O código
     completo fica no Telegram. Espelho de services/site_coupons.py (VPS):
     mesma máscara, mesmo agrupamento, mesma marcação.                        */
  const TELEGRAM_URL = 'https://t.me/promoninjaofertas';
  const COUPON_MASK = '••••••'; // tamanho fixo: não revela o comprimento do código
  const COUPON_PATHS = {
    amazon: '/cupons/amazon/',
    aliexpress: '/cupons/aliexpress/',
    shopee: '/cupons/shopee/',
    mercadolivre: '/cupons/mercado-livre/'
  };
  const LOGO_SIZES = { amazon: [66, 20], aliexpress: [92, 20], shopee: [63, 20], mercadolivre: [51, 20] };
  const TELEGRAM_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.5 4.3 2.9 11.5c-1 .4-1 1.8.1 2.1l4.7 1.5 1.8 5.6c.3.8 1.3 1 1.9.4l2.6-2.4 4.8 3.5c.7.5 1.7.1 1.9-.7L23.9 5.6c.2-1-.8-1.8-1.7-1.4Z"/></svg>';

  const couponPrefix = code =>
    code.slice(0, Math.min(3, Math.max(1, Math.floor(code.length / 2))));

  /** Um item por (loja, código), verificado mais recentemente primeiro.
      Usa last_seen (última confirmação), não data (primeira aparição): "há 40
      dias" num cupom confirmado há minutos faria parecer vencido.
      O código completo não sai daqui. */
  function uniqueCoupons(offers) {
    const grouped = new Map();
    offers.forEach(offer => {
      const code = String(offer.cupom || '').trim();
      if (!code) return;
      const store = String(offer.loja || '').trim().toLowerCase();
      const key = `${store}|${code.toUpperCase()}`;
      const checked = String(offer.last_seen || offer.data || '');
      const current = grouped.get(key);
      if (!current || checked > current.checked)
        grouped.set(key, { store, storeLabel: storeName(store), prefix: couponPrefix(code), checked });
    });
    return [...grouped.values()].sort((a, b) =>
      a.checked < b.checked ? 1 : a.checked > b.checked ? -1 : 0
    );
  }

  function couponCard(coupon) {
    const label = escapeHtml(coupon.storeLabel);
    const prefix = escapeHtml(coupon.prefix);
    const size = LOGO_SIZES[coupon.store];
    const brand = size
      ? `<img class="coupon-card-logo" src="/assets/lojas/${coupon.store}.svg" alt="" width="${size[0]}" height="${size[1]}" decoding="async">`
      : `<span class="coupon-card-store">${label}</span>`;
    const checked = relativeTime(coupon.checked);
    return (
      `<a class="coupon-card" data-store="${escapeHtml(coupon.store)}" href="${TELEGRAM_URL}" target="_blank" rel="noopener" ` +
      `aria-label="Ver no Telegram o cupom da ${label} que começa com ${prefix}">` +
      `<span class="coupon-card-top">${brand}<span class="coupon-card-time">${checked ? `verificado ${escapeHtml(checked)}` : 'Cupom ativo'}</span></span>` +
      '<span class="coupon-card-ticket">' +
      '<span class="coupon-card-label">Cupom</span>' +
      `<span class="coupon-card-code">${prefix}<span class="coupon-card-mask">${COUPON_MASK}</span></span>` +
      '</span>' +
      `<span class="coupon-card-cta">${TELEGRAM_ICON}Ver cupom completo</span>` +
      '</a>'
    );
  }

  function renderCoupons() {
    const coupons = uniqueCoupons(scopedOffers());
    if (resultCount)
      resultCount.innerHTML = coupons.length
        ? `<b>${coupons.length}</b> ${coupons.length === 1 ? 'cupom' : 'cupons'}`
        : 'Nenhum cupom';
    grid.innerHTML = coupons.length
      ? coupons.map(couponCard).join('')
      : `<div class="state">
          <img src="/favicon-192.png" alt="" width="76" height="76">
          <h3>Nenhum cupom ativo aqui agora</h3>
          <p>Os cupons mudam várias vezes por dia. Entre no canal para receber os próximos assim que aparecerem.</p>
          <a class="btn btn-primary" href="${TELEGRAM_URL}" target="_blank" rel="noopener">${TELEGRAM_ICON}Entrar no Telegram</a>
        </div>`;
    const loadMore = $('#loadMore');
    if (loadMore) loadMore.hidden = true;
  }

  /* ------------------------------------------------------------ Renderiza */
  function render() {
    if (isCouponPage) {
      renderCoupons();
      return;
    }
    const offers = filteredOffers();
    const shown = offers.slice(0, state.visible);

    if (resultCount) {
      resultCount.innerHTML = offers.length
        ? `<b>${offers.length}</b> oferta${offers.length === 1 ? '' : 's'}`
        : 'Nenhuma oferta';
    }

    if (!offers.length) {
      grid.innerHTML = `<div class="state">
        <img src="/favicon-192.png" alt="" width="76" height="76">
        <h3>O Ninja procurou por todo lado</h3>
        <p>Nenhuma oferta combina com esses filtros agora. Tente afrouxar um deles — o catálogo é renovado várias vezes por dia.</p>
        <button type="button" class="btn btn-secondary" data-clear-all>Limpar filtros</button>
      </div>`;
    } else {
      grid.innerHTML = shown.map(renderCard).join('');
    }

    const loadMore = $('#loadMore');
    if (loadMore) {
      const remaining = offers.length - shown.length;
      loadMore.hidden = remaining <= 0;
      const label = $('span', loadMore);
      if (label)
        label.textContent = `Carregar mais ${Math.min(remaining, PAGE_SIZE)} ofertas`;
    }

    renderChips();
    renderCuratedSections();
    updateFilterControls();
  }

  /* ------------------------------------------------------------- Controles */
  function updateFilterControls() {
    $$('[data-filter-category]').forEach(node =>
      node.setAttribute('aria-pressed', String(node.dataset.filterCategory === state.category))
    );
    $$('[data-filter-price]').forEach(node =>
      node.setAttribute('aria-pressed', String(node.dataset.filterPrice === state.price))
    );
    $$('[data-filter-discount]').forEach(node =>
      node.setAttribute(
        'aria-pressed',
        String(Number(node.dataset.filterDiscount) === state.discount)
      )
    );
    $$('[data-filter-coupon]').forEach(node =>
      node.setAttribute('aria-pressed', String(state.couponOnly))
    );
    $$('[data-filter-recent]').forEach(node =>
      node.setAttribute('aria-pressed', String(state.recentOnly))
    );
    $$('select[data-filter-order]').forEach(node => {
      node.value = state.order;
    });
    $$('select[data-filter-select="price"]').forEach(node => {
      node.value = state.price;
    });
    $$('select[data-filter-select="discount"]').forEach(node => {
      node.value = String(state.discount);
    });

    const count = clientFilterCount();
    const badge = $('#filterBadge');
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = String(count);
    }

    const applyLabel = $('#sheetApply span');
    if (applyLabel) {
      const total = filteredOffers().length;
      applyLabel.textContent = total
        ? `Ver ${total} oferta${total === 1 ? '' : 's'}`
        : 'Nenhuma oferta';
    }
  }

  function setFilter(patch, eventName, params) {
    Object.assign(state, patch, { visible: PAGE_SIZE });
    if (eventName) track(eventName, params);
    render();
  }

  function clearFilters() {
    Object.assign(state, {
      category: 'Todas',
      query: lockedQuery,
      price: '',
      discount: 0,
      couponOnly: lockedCategory === 'Cupons',
      recentOnly: false,
      visible: PAGE_SIZE
    });
    $$('.search-input').forEach(input => {
      input.value = '';
    });
    track('clear_filters');
    render();
  }

  /* --------------------------------------------------------- Faixa de loja */
  function renderStoreStrip() {
    const list = $('#storeList');
    if (!list) return;
    // Na página de cupons a faixa conta cupons únicos e leva às páginas de
    // cupom de cada loja; no resto do site conta ofertas e leva às lojas.
    const counts = new Map();
    const items = isCouponPage
      ? uniqueCoupons(allOffers).map(coupon => coupon.store)
      : allOffers.map(offer => String(offer.loja || '').toLowerCase());
    items.forEach(slug => {
      if (STORE_NAMES[slug]) counts.set(slug, (counts.get(slug) || 0) + 1);
    });
    const total = items.length;
    const unit = count =>
      isCouponPage ? (count === 1 ? 'cupom' : 'cupons') : count === 1 ? 'oferta' : 'ofertas';
    const allHref = isCouponPage ? '/categorias/cupons.html' : '/';
    const storeHref = slug => (isCouponPage ? COUPON_PATHS[slug] : STORE_PATHS[slug]);

    // Só entram lojas que realmente têm oferta (ou cupom) no catálogo agora.
    const stores = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const current = lockedStore;

    // Logos oficiais em versão branca (assets/lojas/*.svg, origem no comentário
    // de cada arquivo). O alt carrega o nome da loja para leitores de tela.
    // Os cards são links de navegação, então o selecionado usa aria-current.
    const ALL_ICON =
      '<svg class="store-all-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

    const card = (slug, label, href, count, selected) =>
      `<a class="store-card" data-store="${slug}" href="${href}"${selected ? ' aria-current="page"' : ''} data-store-label="${escapeHtml(label)}">
        <span class="store-mark">${
          slug === 'todas'
            ? `${ALL_ICON}<span class="store-name">${escapeHtml(label)}</span>`
            : `<img class="store-logo" src="/assets/lojas/${slug}.svg" alt="${escapeHtml(label)}" decoding="async">`
        }</span>
        ${count ? `<span class="store-count">${count} ${unit(count)}</span>` : ''}
      </a>`;

    list.innerHTML =
      card('todas', 'Todas', allHref, total, !current) +
      stores
        .map(([slug, count]) =>
          card(slug, STORE_NAMES[slug], storeHref(slug), count, current === STORE_NAMES[slug])
        )
        .join('');
  }

  /* --------------------------------------------------------------- Eventos */
  document.addEventListener('click', event => {
    const target = event.target;

    const category = target.closest('[data-filter-category]');
    if (category)
      setFilter({ category: category.dataset.filterCategory }, 'filter_category', {
        category: category.dataset.filterCategory
      });

    const price = target.closest('[data-filter-price]');
    if (price) {
      const value = price.dataset.filterPrice === state.price ? '' : price.dataset.filterPrice;
      setFilter({ price: value }, 'filter_price', { price_range: value || 'todos' });
    }

    const discount = target.closest('[data-filter-discount]');
    if (discount) {
      const value =
        Number(discount.dataset.filterDiscount) === state.discount
          ? 0
          : Number(discount.dataset.filterDiscount);
      setFilter({ discount: value }, 'filter_discount', { min_discount: value });
    }

    if (target.closest('[data-filter-coupon]'))
      setFilter({ couponOnly: !state.couponOnly }, 'filter_coupon', {
        enabled: !state.couponOnly
      });

    if (target.closest('[data-filter-recent]'))
      setFilter({ recentOnly: !state.recentOnly }, 'filter_recent', {
        enabled: !state.recentOnly
      });

    const clear = target.closest('[data-clear]');
    if (clear) {
      const key = clear.dataset.clear;
      const resets = {
        category: 'Todas',
        price: '',
        discount: 0,
        couponOnly: false,
        recentOnly: false,
        query: ''
      };
      if (key === 'query') $$('.search-input').forEach(input => (input.value = ''));
      setFilter({ [key]: resets[key] });
    }

    if (target.closest('[data-clear-all]')) clearFilters();

    if (target.closest('#loadMore')) {
      state.visible += PAGE_SIZE;
      track('load_more', { visible: state.visible });
      render();
    }

    if (target.closest('#filterOpen')) {
      track('open_filters');
      filterSheet?.open();
    }
  });

  document.addEventListener('change', event => {
    const order = event.target.closest('select[data-filter-order]');
    if (order) setFilter({ order: order.value }, 'sort_offers', { order: order.value });

    const select = event.target.closest('select[data-filter-select]');
    if (!select) return;
    if (select.dataset.filterSelect === 'price')
      setFilter({ price: select.value }, 'filter_price', {
        price_range: select.value || 'todos'
      });
    if (select.dataset.filterSelect === 'discount')
      setFilter({ discount: Number(select.value) }, 'filter_discount', {
        min_discount: Number(select.value)
      });
  });

  const runSearch = debounce(value => {
    setFilter({ query: value });
    if (value.length >= 3) track('search', { search_term: value });
  }, 260);

  $$('.search-input').forEach(input => {
    input.addEventListener('input', () => {
      const value = input.value.trim();
      $$('.search-input').forEach(other => {
        if (other !== input) other.value = input.value;
      });
      runSearch(value);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchOverlay?.close();
        $('#grid')?.scrollIntoView({ block: 'start' });
      }
    });
  });

  $('#sheetApply')?.addEventListener('click', () => filterSheet?.close());

  /* ----------------------------------------------------------- Carregamento */
  function showLoading() {
    if (!grid.querySelector('.card')) grid.innerHTML = renderSkeletons();
  }

  function showError() {
    if (grid.querySelector('.card')) return; // mantém o SSR se ele existir
    if (resultCount) resultCount.textContent = 'Indisponível';
    grid.innerHTML = `<div class="state">
      <img src="/favicon-192.png" alt="" width="76" height="76">
      <h3>Parece que até o Ninja perdeu o sinal</h3>
      <p>Não foi possível carregar as ofertas agora. Verifique sua conexão e tente novamente em instantes.</p>
      <button type="button" class="btn btn-secondary" onclick="location.reload()">Tentar novamente</button>
    </div>`;
  }

  showLoading();

  fetch(`/catalog.json?t=${Math.floor(Date.now() / 60000)}`)
    .then(response => {
      if (!response.ok) throw new Error('catalog');
      return response.json();
    })
    .then(data => {
      allOffers = (data.ofertas || [])
        .filter(offer => offer && offer.titulo && Number(offer.por) > 0)
        .filter(offer =>
          offer.expires_at
            ? Date.parse(offer.expires_at) > Date.now()
            : ageHours(offer.last_seen || offer.data) < MAX_AGE_HOURS
        )
        .map(offer => ({
          ...offer,
          storeLabel: storeName(offer.loja),
          group: categoryGroup(offer)
        }));
      loaded = true;
      renderStoreStrip();
      render();
    })
    .catch(showError);

  // Rede caiu depois do load: avisa sem quebrar a página.
  addEventListener('offline', () => toast('Você está sem conexão.', 'error'));
  addEventListener('online', () => {
    if (!loaded) location.reload();
  });
})();
