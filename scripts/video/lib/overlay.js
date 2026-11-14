/*
 * Presentation layer for the recorded demo, injected into every document of
 * the recording context with page.addInitScript. It never touches the app's
 * state: it only draws on top of it.
 *
 *  - a DOM cursor that follows real mouse events, with a click ripple
 *    (Playwright's video does not render the OS cursor);
 *  - a caption bar with a step label, which moves out of the way of the
 *    element being demonstrated and of open dialogs;
 *  - a highlight ring around the element being pointed at;
 *  - the title card and the end card.
 *
 * Everything lives in one `popover="manual"` element so it renders in the top
 * layer, above the app's native <dialog>s; it is re-raised whenever a dialog
 * opens. The current caption and cursor position survive full navigations via
 * sessionStorage.
 */
(() => {
  if (window.top !== window) return;
  if (window.__demo) return;

  const INK = '#0e0b0a';
  const BONE = '#f3ede2';
  const MUTED = '#bdb2a3';
  const CRIMSON = '#ef5a6c';
  const BRASS = '#d3b77f';
  const SANS = "'Geist Variable', 'Geist', ui-sans-serif, system-ui, 'Segoe UI', sans-serif";
  const SERIF = "'Instrument Serif', ui-serif, Georgia, serif";
  const MONO = "'Geist Mono Variable', ui-monospace, Consolas, monospace";
  const EASE = 'cubic-bezier(0.65, 0, 0.2, 1)';
  const cfg = window.__DEMO_CFG || {};
  // The design below is in 1920x1080 output pixels; the page is recorded at a smaller CSS viewport with a device scale factor.
  const U = 1 / (cfg.scale || 1);
  const px = (t) => t.replace(/(\d*\.?\d+)px/g, (_, n) => `${+(n * U).toFixed(2)}px`);

  const ss = {
    get(k) {
      try {
        return JSON.parse(sessionStorage.getItem('__demo:' + k));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        sessionStorage.setItem('__demo:' + k, JSON.stringify(v));
      } catch {
        /* storage unavailable */
      }
    },
  };

  const VELVET = `
    background-color:#7a0b1d;
    background-image:
      linear-gradient(180deg, rgb(0 0 0 / .5) 0%, rgb(0 0 0 / 0) 22%, rgb(0 0 0 / 0) 68%, rgb(0 0 0 / .55) 100%),
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0) 0%, rgb(0 0 0 / .22) 3%, rgb(0 0 0 / 0) 6.5%, rgb(255 255 255 / .03) 8%, rgb(0 0 0 / 0) 10%),
      repeating-linear-gradient(90deg, #1f0207 0%, #43050f 3%, #7a0b1d 7.5%, #ac142d 11%, #cf3448 12.2%, #ac142d 13.4%, #7a0b1d 16%, #1f0207 20%);
    background-size: 100% 100%, 130px 100%, 180px 100%;`;

  const css = `
  #__demo-root { all: initial; position: fixed; inset: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: 0;
    background: transparent; overflow: visible; pointer-events: none; z-index: 2147483647; display: block; color: ${BONE}; font-family: ${SANS}; }
  #__demo-root::backdrop { display: none; }
  #__demo-root * { box-sizing: border-box; }
  .__d-cursor { position: fixed; left: 0; top: 0; width: 34px; height: 34px; transform: translate(-100px, -100px);
    will-change: transform; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .55)); transition: opacity .3s; }
  .__d-cursor svg { display: block; width: 100%; height: 100%; }
  .__d-ripple { position: fixed; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
    border: 3px solid ${BRASS}; background: rgb(211 183 127 / .18); animation: __d-ripple .65s ${EASE} forwards; }
  @keyframes __d-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.35); opacity: 0 } }
  .__d-ring { position: fixed; border-radius: 16px; border: 3px solid ${BRASS};
    box-shadow: 0 0 0 6px rgb(211 183 127 / .16), 0 0 36px rgb(211 183 127 / .25); opacity: 0;
    transition: opacity .35s ${EASE}, left .35s ${EASE}, top .35s ${EASE}, width .35s ${EASE}, height .35s ${EASE}; }
  .__d-cap { position: fixed; left: 50%; bottom: 36px; width: max-content; max-width: min(1560px, calc(100vw - 120px));
    transform: translate(-50%, 0); display: flex; align-items: stretch; gap: 0; border-radius: 18px; overflow: hidden;
    background: #0e0b0a; border: 1px solid #43382f; box-shadow: 0 24px 60px -18px rgb(0 0 0 / .85), 0 0 0 1px rgb(0 0 0 / .4);
    opacity: 0; transition: opacity .45s ${EASE}, transform .45s ${EASE}, top .45s ${EASE}, bottom .45s ${EASE}, left .45s ${EASE}; }
  .__d-cap.__on { opacity: 1; }
  .__d-cap .__bar { width: 9px; background: linear-gradient(180deg, #ac142d, #7a0b1d); flex: none; }
  .__d-cap .__body { padding: 20px 34px 24px 28px; }
  .__d-cap .__label { font: 600 20px/1 ${MONO}; letter-spacing: .14em; text-transform: uppercase; color: ${CRIMSON}; margin-bottom: 12px; }
  .__d-cap .__label span { color: ${BRASS}; }
  .__d-cap .__text { font: 500 38px/1.28 ${SANS}; letter-spacing: -.005em; color: ${BONE}; max-width: 1480px; text-wrap: pretty; }
  .__d-role { position: fixed; top: 26px; right: 32px; display: flex; align-items: center; gap: 14px; padding: 13px 24px 13px 20px; border-radius: 999px;
    background: #0e0b0a; border: 2px solid ${BRASS}; color: ${BONE}; font: 600 26px/1 ${SANS}; letter-spacing: .01em;
    box-shadow: 0 14px 36px -12px rgb(0 0 0 / .85); opacity: 0; transform: translateY(-10px); transition: opacity .35s ${EASE}, transform .35s ${EASE}; }
  .__d-role.__on { opacity: 1; transform: none; }
  .__d-role i { width: 14px; height: 14px; border-radius: 50%; background: ${CRIMSON}; flex: none; }
  .__d-role.__dao i { background: ${BRASS}; }
  .__d-role span { font-weight: 400; color: ${MUTED}; }
  .__d-card { position: fixed; inset: 0; display: grid; place-items: center; overflow: hidden; }
  .__d-card .__panel { position: absolute; top: 0; bottom: 0; width: 50.5%; ${VELVET} transition: transform 1.25s ${EASE}; }
  .__d-card .__panel.__l { left: 0; transform-origin: 0 50%; box-shadow: 10px 0 30px -12px rgb(0 0 0 / .7); }
  .__d-card .__panel.__r { right: 0; transform-origin: 100% 50%; box-shadow: -10px 0 30px -12px rgb(0 0 0 / .7); }
  .__d-card .__pelmet { position: absolute; left: 0; right: 0; top: 0; height: 14px; background: linear-gradient(180deg, #ac142d, #1f0207);
    border-bottom: 1px solid rgb(211 183 127 / .7); transition: opacity .6s; }
  .__d-card .__stage { position: relative; z-index: 2; text-align: center; padding: 64px 90px 70px; border-radius: 22px;
    background: radial-gradient(ellipse at center, rgb(14 11 10 / .96) 0%, rgb(14 11 10 / .9) 60%, rgb(14 11 10 / 0) 100%);
    transition: opacity .6s ${EASE}, transform .9s ${EASE}; max-width: 1280px; }
  .__d-card .__eyebrow { font: 500 17px/1 ${SANS}; letter-spacing: .22em; text-transform: uppercase; color: ${BRASS}; display: flex; gap: 18px; align-items: center; justify-content: center; }
  .__d-card .__eyebrow i { display: inline-block; width: 46px; height: 1px; background: rgb(211 183 127 / .6); }
  .__d-card .__title { margin-top: 26px; font: 400 128px/1 ${SERIF}; letter-spacing: -.02em; color: ${BONE}; display: flex; align-items: center; gap: 30px; justify-content: center; }
  .__d-card .__title img { width: 104px; height: 104px; }
  .__d-card .__title em { color: ${CRIMSON}; font-style: italic; }
  .__d-card .__sub { margin: 30px auto 0; max-width: 1000px; font: 400 34px/1.38 ${SANS}; color: ${MUTED}; text-wrap: balance; }
  .__d-card .__sub b { color: ${BONE}; font-weight: 500; }
  .__d-card .__meta { margin-top: 40px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .__d-card .__chip { font: 500 20px/1 ${MONO}; letter-spacing: .04em; padding: 14px 20px; border-radius: 999px; border: 1px solid #43382f; color: ${BONE}; background: rgb(30 25 22 / .9); }
  .__d-card .__chip.__accent { border-color: rgb(239 90 108 / .6); color: ${CRIMSON}; }
  .__d-card .__url { margin-top: 34px; font: 500 40px/1 ${MONO}; color: ${BONE}; letter-spacing: -.01em; }
  .__d-card .__url span { color: ${BRASS}; }
  `;

  let root;
  let cursor;
  let ring;
  let cap;
  let roleChip;
  let focusEl = null;
  let ringEl = null;
  let raf = 0;

  const pos = ss.get('cursor') || { x: 960 * U, y: 560 * U };

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function raise() {
    if (!root || !root.isConnected) return;
    try {
      if (root.matches(':popover-open')) root.hidePopover();
      root.showPopover();
    } catch {
      /* popover unsupported: z-index still applies outside the top layer */
    }
  }

  function mount() {
    if (root && root.isConnected) return;
    const style = el('style');
    style.textContent = px(css);
    (document.head || document.documentElement).appendChild(style);
    root = el('div');
    root.id = '__demo-root';
    root.setAttribute('popover', 'manual');
    root.setAttribute('aria-hidden', 'true');
    ring = el('div', '__d-ring');
    cap = el('div', '__d-cap', '<div class="__bar"></div><div class="__body"><div class="__label"></div><div class="__text"></div></div>');
    cursor = el(
      'div',
      '__d-cursor',
      `<svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 2.5 L4 21 L9 16.6 L12.4 24 L15.9 22.4 L12.6 15.2 L19.5 15.2 Z" fill="${BONE}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    );
    roleChip = el('div', '__d-role');
    root.append(ring, cap, roleChip, cursor);
    document.documentElement.appendChild(root);
    raise();
    moveCursor(pos.x, pos.y);
    if (cfg.hideCursorUntilMove) cursor.style.opacity = '0';
    const savedRole = ss.get('role');
    if (savedRole) setRole(savedRole.who, savedRole.sub, savedRole.kind);
    const saved = ss.get('caption');
    if (saved && saved.text) caption(saved.label, saved.text, true);
    if (ss.get('title') === 'showing' || (cfg.titleOnFirstLoad && !ss.get('started'))) titleCard();
    ss.set('started', 1);

    // Re-raise above native modal dialogs whenever one opens.
    new MutationObserver((muts) => {
      if (muts.some((m) => m.target instanceof HTMLDialogElement || [...m.addedNodes].some((n) => n instanceof HTMLDialogElement))) raise();
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'], childList: true });

    // Extra room under the content so nothing has to sit behind the caption.
    const spacer = el('style');
    spacer.textContent = `#app-main::after, main#main::after { content: ""; display: block; height: ${Math.round(210 * U)}px; }`;
    document.head.appendChild(spacer);

    tick();
  }

  function moveCursor(x, y) {
    pos.x = x;
    pos.y = y;
    if (cursor) cursor.style.transform = `translate(${x - 4 * U}px, ${y - 2 * U}px)`;
  }

  window.addEventListener(
    'mousemove',
    (e) => {
      moveCursor(e.clientX, e.clientY);
      if (cursor) cursor.style.opacity = '1';
      ss.set('cursor', { x: e.clientX, y: e.clientY });
    },
    true,
  );
  window.addEventListener(
    'mousedown',
    (e) => {
      if (!root) return;
      const r = el('div', '__d-ripple');
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      root.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
    true,
  );

  const intersects = (a, b, pad = 20 * U) => !(a.right + pad <= b.left || b.right + pad <= a.left || a.bottom + pad <= b.top || b.bottom + pad <= a.top);

  function obstacles() {
    const out = [];
    for (const d of document.querySelectorAll('dialog[open]')) {
      const panel = d.firstElementChild ? d : d;
      const r = panel.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push(r);
    }
    for (const e of [focusEl, ringEl]) {
      if (e && e.isConnected) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(r);
      }
    }
    return out;
  }

  /** Bottom-centre, unless that covers the demonstrated element or a dialog: then top-centre, then a side slot. */
  function placeCaption() {
    if (!cap || !cap.classList.contains('__on')) return;
    const obs = obstacles();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = cap.offsetWidth;
    const h = cap.offsetHeight;
    const M = 36 * U;
    const slots = [
      { name: 'bottom', rect: new DOMRect((vw - w) / 2, vh - M - h, w, h) },
      { name: 'top', rect: new DOMRect((vw - w) / 2, M + 90 * U, w, h) },
    ];
    for (const o of obs) {
      if (o.left > 900 * U) slots.push({ name: 'left', rect: new DOMRect(M, vh - M - h, Math.min(w, o.left - 80 * U), h), maxW: o.left - 80 * U });
      if (vw - o.right > 900 * U) slots.push({ name: 'right', rect: new DOMRect(o.right + 40 * U, vh - M - h, Math.min(w, vw - o.right - 80 * U), h), maxW: vw - o.right - 80 * U, x: o.right + 40 * U });
    }
    const pick = slots.find((s) => obs.every((o) => !intersects(s.rect, o))) || slots[0];
    if (cap.dataset.slot === pick.name && cap.dataset.maxw === String(pick.maxW || '')) return;
    cap.dataset.slot = pick.name;
    cap.dataset.maxw = String(pick.maxW || '');
    const s = cap.style;
    if (pick.name === 'bottom' || pick.name === 'top') {
      s.left = '50%';
      s.transform = 'translate(-50%, 0)';
      s.maxWidth = '';
      if (pick.name === 'bottom') {
        s.top = '';
        s.bottom = M + 'px';
      } else {
        s.bottom = '';
        s.top = M + 90 * U + 'px';
      }
    } else {
      s.transform = 'none';
      s.top = '';
      s.bottom = M + 'px';
      s.left = (pick.name === 'left' ? M : pick.x) + 'px';
      s.maxWidth = pick.maxW + 'px';
    }
  }

  function placeRing() {
    if (!ring) return;
    if (!ringEl || !ringEl.isConnected) {
      ring.style.opacity = '0';
      return;
    }
    const r = ringEl.getBoundingClientRect();
    const p = 10 * U;
    ring.style.left = r.left - p + 'px';
    ring.style.top = r.top - p + 'px';
    ring.style.width = r.width + p * 2 + 'px';
    ring.style.height = r.height + p * 2 + 'px';
    ring.style.opacity = '1';
  }

  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      placeCaption();
      placeRing();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function caption(label, text, instant = false) {
    if (!cap) return;
    ss.set('caption', { label, text });
    const lab = cap.querySelector('.__label');
    const txt = cap.querySelector('.__text');
    const apply = () => {
      const m = /^(\d+)\s*·\s*(.*)$/.exec(label || '');
      lab.innerHTML = m ? `<span>${m[1]}</span> · ${m[2]}` : label || '';
      txt.textContent = text;
      delete cap.dataset.slot;
      cap.classList.add('__on');
    };
    if (instant || !cap.classList.contains('__on')) {
      apply();
      return;
    }
    cap.classList.remove('__on');
    setTimeout(apply, 260);
  }

  function setRole(who, sub, kind) {
    if (!roleChip) return;
    ss.set('role', who ? { who, sub, kind } : null);
    if (!who) {
      roleChip.classList.remove('__on');
      return;
    }
    roleChip.className = '__d-role __on' + (kind === 'dao' ? ' __dao' : '');
    roleChip.innerHTML = `<i></i>${who}${sub ? ` <span>· ${sub}</span>` : ''}`;
  }

  function clearCaption() {
    ss.set('caption', null);
    if (cap) cap.classList.remove('__on');
  }

  function cardShell() {
    const card = el('div', '__d-card');
    card.innerHTML = '<div class="__panel __l"></div><div class="__panel __r"></div><div class="__pelmet"></div><div class="__stage"></div>';
    root.appendChild(card);
    return card;
  }

  const logo = () => `<img alt="" src="${new URL('favicon.svg', cfg.appBase || location.href).href}">`;

  function titleCard() {
    if (!root) return;
    document.querySelector('.__d-card.__title-card')?.remove();
    const card = cardShell();
    card.classList.add('__title-card');
    card.querySelector('.__stage').innerHTML = `
      <div class="__eyebrow">Private payments on NEAR <i></i> Testnet</div>
      <div class="__title">${logo()}<span>Perde</span></div>
      <p class="__sub">Every payment on NEAR names its recipient.<br><b>Perde sends each one to a fresh account only the recipient can find.</b></p>`;
    ss.set('title', 'showing');
    return card;
  }

  function openTitle() {
    const card = document.querySelector('.__d-card.__title-card');
    ss.set('title', null);
    if (!card) return;
    const stage = card.querySelector('.__stage');
    stage.style.opacity = '0';
    stage.style.transform = 'scale(.97)';
    card.querySelector('.__pelmet').style.opacity = '0';
    setTimeout(() => {
      card.querySelector('.__l').style.transform = 'scaleX(0)';
      card.querySelector('.__r').style.transform = 'scaleX(0)';
    }, 250);
    setTimeout(() => card.remove(), 1700);
  }

  function endCard(repo) {
    if (!root) return;
    clearCaption();
    setRole(null);
    const card = cardShell();
    const [l, r] = [card.querySelector('.__l'), card.querySelector('.__r')];
    const stage = card.querySelector('.__stage');
    l.style.transform = r.style.transform = 'scaleX(0)';
    stage.style.opacity = '0';
    stage.innerHTML = `
      <div class="__title">${logo()}<span>Perde</span></div>
      <p class="__sub">Private payments on NEAR</p>
      <div class="__url">${repo}</div>
      <div class="__meta"><span class="__chip __accent">Built at NEAR HACKATHON</span></div>
      <div class="__meta"><span class="__chip">Testnet prototype · unaudited · amounts stay public</span></div>`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        l.style.transform = r.style.transform = 'scaleX(1)';
        setTimeout(() => {
          stage.style.opacity = '1';
        }, 900);
      }),
    );
  }

  /** Smooth scroll of the window to y over `ms`, with the app's ease curve. */
  function scrollToY(y, ms = 900) {
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    const start = window.scrollY;
    const max = html.scrollHeight - window.innerHeight;
    const end = Math.max(0, Math.min(max, y));
    const d = end - start;
    if (Math.abs(d) < 2) {
      html.style.scrollBehavior = prev;
      return Promise.resolve();
    }
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    return new Promise((ok) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, start + d * ease(t));
        if (t < 1) requestAnimationFrame(step);
        else {
          html.style.scrollBehavior = prev;
          ok();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** Scroll so `elem` sits in the safe area (below `top`, above the caption zone). */
  function scrollIntoSafe(elem, { top = 96 * U, bottomReserve = 250 * U, align = 'auto', ms = 900 } = {}) {
    if (!elem) return Promise.resolve();
    const r = elem.getBoundingClientRect();
    const vh = window.innerHeight;
    const safeBottom = vh - bottomReserve;
    let target = null;
    if (align === 'top') target = window.scrollY + r.top - top;
    else if (align === 'center') target = window.scrollY + r.top + r.height / 2 - (top + safeBottom) / 2;
    else if (r.top < top) target = window.scrollY + r.top - top;
    else if (r.bottom > safeBottom) target = window.scrollY + Math.min(r.top - top, r.bottom - safeBottom);
    if (target === null) return Promise.resolve();
    // Duration proportional to distance, within bounds, so short hops stay short.
    const dist = Math.abs(target - window.scrollY);
    return scrollToY(target, Math.max(500, Math.min(ms * 1.4, ms * (dist / 700))));
  }

  window.__demo = {
    caption,
    clearCaption,
    setRole,
    titleCard,
    openTitle,
    endCard,
    scrollToY,
    scrollIntoSafe,
    focus(e) {
      focusEl = e || null;
    },
    ring(e) {
      ringEl = e || null;
      if (!e && ring) ring.style.opacity = '0';
    },
    cursorPos: () => ({ x: pos.x, y: pos.y }),
    ready: () => !!(root && root.isConnected),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  // The app may replace <html> children; keep the layer mounted.
  setInterval(() => {
    if (!root || !root.isConnected) mount();
  }, 500);
})();
