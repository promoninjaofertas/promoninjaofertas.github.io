/* Busca só nos produtos realmente publicados; os links funcionam sem JS. */
(() => {
  'use strict';
  const input = document.getElementById('instagramSearch');
  if (!input) return;
  const cards = [...document.querySelectorAll('[data-instagram-search]')];
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  input.addEventListener('input', () => {
    const words = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
    let count = 0;
    cards.forEach(card => {
      const matches = words.every(word => normalize(card.dataset.instagramSearch).includes(word));
      card.hidden = !matches;
      if (matches) count += 1;
    });
    document.getElementById('instagramCount').textContent = `${count} produto${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`;
    document.getElementById('instagramEmpty').hidden = count !== 0;
  });
})();
