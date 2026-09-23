/* 하나회원권거래소 — 인터랙션(카운터·스크롤 리빌·시세 필터·비교·추이 모달·FAQ·폼·유튜브) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // 헤더·모바일 메뉴·맨 위로
  const header = $('#header'); const burger = $('#burger'); const mnav = $('#mobileNav'); const toTop = $('#toTop');
  const onScroll = () => { header && header.classList.toggle('scrolled', window.scrollY > 8); toTop && toTop.classList.toggle('show', window.scrollY > 500); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // 드로어 내비(우측 슬라이드) — 백드롭 클릭·ESC·닫기 버튼으로 닫힘, 열릴 때 스크롤 잠금
  const bd = $('#drawerBd'); const setDrawer = (open) => { if (!mnav) return; mnav.classList.toggle('open', open); bd && bd.classList.toggle('open', open); burger && burger.setAttribute('aria-expanded', String(open)); document.body.style.overflow = open ? 'hidden' : ''; if (open) { const f = $('#drawerClose'); f && f.focus(); } };
  burger && burger.addEventListener('click', () => setDrawer(!mnav.classList.contains('open')));
  bd && bd.addEventListener('click', () => setDrawer(false)); const dc = $('#drawerClose'); dc && dc.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
  // 스크롤 진행바
  const prog = $('#progress'); const onProg = () => { if (!prog) return; const h = document.documentElement; const p = h.scrollHeight - h.clientHeight; prog.style.width = p > 0 ? (h.scrollTop / p * 100) + '%' : '0'; }; window.addEventListener('scroll', onProg, { passive: true }); onProg();
  // 토스트
  window.toast = (msg, type = 'info', ms = 3200) => { const w = $('#toasts'); if (!w) return; const t = document.createElement('div'); t.className = 'toast ' + type; t.innerHTML = `<span>${type === 'ok' ? '✅' : type === 'err' ? '⚠️' : 'ℹ️'}</span><span>${msg}</span>`; w.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms); return t; };
  // 히어로: 커서 패럴랙스(오브) + 스포트라이트 + 3D 틸트 + 마그네틱 버튼 (터치·감소동작 환경에선 비활성)
  const fine = matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = $('.hero');
  if (fine && hero) {
    const orbs = $$('.orb[data-depth]', hero); let raf = null, mx = 0, my = 0;
    hero.addEventListener('mousemove', (e) => { const r = hero.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; hero.style.setProperty('--mx', mx + 'px'); hero.style.setProperty('--my', my + 'px'); if (raf) return; raf = requestAnimationFrame(() => { raf = null; const cx = mx - r.width / 2, cy = my - r.height / 2; orbs.forEach(o => { const d = Number(o.dataset.depth) || .05; o.style.transform = `translate(${(cx * d).toFixed(1)}px, ${(cy * d).toFixed(1)}px)`; }); }); });
    hero.addEventListener('mouseleave', () => orbs.forEach(o => o.style.transform = ''));
  }
  if (fine) {
    $$('.tilt').forEach(el => { const max = Number(el.dataset.tilt) || 5; el.addEventListener('mousemove', (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`; }); el.addEventListener('mouseleave', () => { el.style.transform = ''; }); });
    $$('.magnet').forEach(el => { el.addEventListener('mousemove', (e) => { const r = el.getBoundingClientRect(); const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); el.style.transform = `translate(${(x * .18).toFixed(1)}px, ${(y * .28).toFixed(1)}px)`; }); el.addEventListener('mouseleave', () => { el.style.transform = ''; }); });
  }
  // 시세표 행 순차 등장
  $$('.price-table tbody tr').slice(0, 40).forEach((tr, i) => { tr.classList.add('enter'); tr.style.animationDelay = `${i * 18}ms`; });
  toTop && toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // 스크롤 리빌
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`; io ? io.observe(el) : el.classList.add('in'); });

  // 카운터
  const cio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (!e.isIntersecting) return; const el = e.target; const to = Number(el.dataset.count) || 0; const t0 = performance.now(); const dur = 1400; const step = (t) => { const p = Math.min(1, (t - t0) / dur); const v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v.toLocaleString('ko-KR'); if (p < 1) requestAnimationFrame(step); else el.classList.add('kpi-pop'); }; requestAnimationFrame(step); cio.unobserve(el); })) : null;
  $$('[data-count]').forEach(el => cio ? cio.observe(el) : (el.textContent = el.dataset.count));

  // 홈 빠른 시세 필터
  const qt = $('#qtTable'); if (qt) {
    const input = $('#qtFilter'); let region = '';
    const apply = () => { const q = (input.value || '').trim().toLowerCase(); $$('tbody tr', qt).forEach(tr => { const ok = (!q || tr.dataset.name.toLowerCase().includes(q)) && (!region || tr.dataset.region === region); tr.style.display = ok ? '' : 'none'; }); };
    input.addEventListener('input', apply);
    $$('#qtRegions .chip').forEach(c => c.addEventListener('click', () => { $$('#qtRegions .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); region = c.dataset.region; apply(); }));
  }

  // 시세표: 검색 즉시 필터(서버 제출 전 클라이언트 필터), 비교, 추이 모달
  const mk = $('#mkTable'); if (mk) {
    const q = $('#mkQ'); q && q.addEventListener('input', () => { const v = q.value.trim().toLowerCase(); $$('tbody tr', mk).forEach(tr => { if (!tr.dataset.name) return; tr.style.display = !v || tr.dataset.name.toLowerCase().includes(v) ? '' : 'none'; }); });
    const cmpToggle = $('#cmpToggle'); const cmpPanel = $('#cmpPanel'); const cmpBody = $('#cmpBody');
    const renderCmp = () => { const sel = $$('.cmp-chk:checked', mk).map(c => c.closest('tr')); if (!sel.length) { cmpBody.innerHTML = '<p class="cmp-empty">표에서 비교할 종목을 최대 3개 선택하세요.</p>'; return; } cmpBody.innerHTML = sel.map(tr => { const t = Number(tr.dataset.today), p = Number(tr.dataset.prev || t); const d = t - p; const pct = p ? Math.round(d / p * 1000) / 10 : 0; return `<div class="cmp-card"><small>${tr.dataset.region || ''}</small><h4 style="margin:2px 0 6px">${tr.dataset.name}</h4><b>${t.toLocaleString('ko-KR')}만원</b><span class="${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : ''}${d ? d.toLocaleString('ko-KR') + ' (' + pct + '%)' : '보합'}</span></div>`; }).join(''); };
    cmpToggle && cmpToggle.addEventListener('click', () => { const on = cmpPanel.hidden; cmpPanel.hidden = !on; $$('.cmp-col', mk).forEach(c => c.hidden = !on); cmpToggle.textContent = on ? '비교 닫기' : '종목 비교'; renderCmp(); });
    mk.addEventListener('change', (e) => { if (!e.target.classList.contains('cmp-chk')) return; if ($$('.cmp-chk:checked', mk).length > 3) { e.target.checked = false; (window.toast ? toast('최대 3개까지 비교할 수 있습니다.', 'err') : alert('최대 3개까지 비교할 수 있습니다.')); } renderCmp(); });
    const modal = $('#histModal'); const chart = $('#histChart'); const title = $('#histTitle'); const note = $('#histNote'); const cat = location.pathname.split('/')[2] || 'golf';
    const close = () => { modal.hidden = true; }; $('.modal-close', modal).addEventListener('click', close); modal.addEventListener('click', (e) => { if (e.target === modal) close(); }); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const draw = (hist, name) => { const vals = hist.map(h => h.value); const W = 640, H = 220, P = 56; if (vals.length < 2) { chart.innerHTML = '<p class="note">추이 데이터가 아직 2개 미만입니다. 매주 갱신되며 누적됩니다.</p>'; return; } const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1; const x = (i) => P + i / (vals.length - 1) * (W - P * 2); const y = (v) => H - P + 6 - (v - min) / span * (H - P * 2); const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' '); const up = vals[vals.length - 1] >= vals[0]; const col = up ? '#d0342c' : '#1a63c9'; const grid = [0, .25, .5, .75, 1].map(f => { const v = Math.round(min + span * f); return `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e8f0"/><text x="${P - 6}" y="${y(v) + 4}" font-size="11" fill="#6b7485" text-anchor="end">${v.toLocaleString()}</text>`; }).join(''); const dots = hist.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.value)}" r="3.5" fill="${col}"><title>${h.date}: ${h.value.toLocaleString()}만원</title></circle>`).join(''); const labels = [0, Math.floor((hist.length - 1) / 2), hist.length - 1].map(i => `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="#6b7485" text-anchor="middle">${hist[i].date.slice(5)}</text>`).join(''); chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${name} 시세 추이">${grid}<polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" points="${pts}"/>${dots}${labels}</svg>`; note.textContent = `${hist[0].date} ~ ${hist[hist.length - 1].date} · 최저 ${min.toLocaleString()} · 최고 ${max.toLocaleString()} · 단위 만원`; };
    mk.addEventListener('click', async (e) => { const b = e.target.closest('[data-hist]'); if (!b || b.tagName === 'A') return; e.preventDefault(); const id = b.dataset.hist; const tr = b.closest('tr'); title.textContent = `${tr.dataset.name} 최근 90일 시세 추이`; chart.innerHTML = '<div class="skel skel-chart"></div><div class="skel skel-line" style="width:60%"></div>'; modal.hidden = false; try { const r = await fetch(`/api/prices/${cat}/${id}/history?days=90`); const j = await r.json(); draw(j.history, tr.dataset.name); } catch (_) { chart.innerHTML = '<p class="note">추이를 불러오지 못했습니다.</p>'; } });
  }

  // FAQ: 하나 열면 같은 목록의 다른 항목 닫기(선택적 UX)
  $$('.faq-list').forEach(list => list.addEventListener('toggle', (e) => { if (e.target.open) $$('details[open]', list).forEach(d => { if (d !== e.target) d.open = false; }); }, true));

  // 문의 폼 AJAX
  $$('form[data-ajax]').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('.form-msg', form); const btn = $('button[type=submit]', form);
    const data = Object.fromEntries(new FormData(form).entries()); if (!data.agree) { msg.className = 'form-msg err'; msg.textContent = '개인정보 수집·이용에 동의해 주세요.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = '접수 중…';
    try { const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || '오류'); msg.className = 'form-msg ok'; msg.textContent = j.message || '접수되었습니다.'; form.reset(); window.toast && toast('상담 신청이 접수되었습니다. 담당자가 곧 연락드립니다.', 'ok', 5000); if (window.gtag) gtag('event', 'generate_lead', { kind: data.kind }); } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; window.toast && toast(err.message, 'err'); } finally { btn.disabled = false; }
  }));

  // 유튜브 지연 로드
  $$('.yt').forEach(box => box.addEventListener('click', () => { const id = box.dataset.id; box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="YouTube" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`; }));

  // 연혁 v2 — 상단 그리드 카드 클릭 → 연표 해당 시기로; 연표는 뷰포트 중앙에 가까운 카드가 포커스, 연도 배지가 따라오고 척추선이 채워짐
  const tl2 = $('#tl2');
  if (tl2) {
    const items = $$('.tl2-item', tl2), fill = $('#tl2Fill'), yearEl = $('#tl2Year'), cells = $$('.hg-cell');
    let focusI = -1;
    const setFocus = (i) => { if (i === focusI) return; focusI = i; items.forEach((el, k) => el.classList.toggle('focus', k === i)); const it = items[i]; if (!it) return; if (yearEl && yearEl.textContent !== it.dataset.year) { yearEl.textContent = it.dataset.year; yearEl.classList.remove('pop'); void yearEl.offsetWidth; yearEl.classList.add('pop'); } cells.forEach(c => c.classList.toggle('now', c.dataset.pi === it.dataset.pi)); };
    // 스크롤 목표값은 즉시 계산하고, 배지 위치·척추선 채움은 rAF에서 서서히 따라가게(관성) 해 고급스럽게
    let tFill = 0, tY = 0, cFill = 0, cY = 0, raf = null;
    const measure = () => {
      const r = tl2.getBoundingClientRect(); const mid = innerHeight * .5;
      tFill = Math.max(0, Math.min(1, (mid - r.top) / r.height)); tY = Math.max(0, Math.min(r.height - 40, mid - r.top - 20));
      let best = 0, bd = 1e9; items.forEach((el, k) => { const b = el.getBoundingClientRect(); const d = Math.abs(b.top + b.height / 2 - mid); if (d < bd) { bd = d; best = k; } });
      setFocus(best); if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => { cFill += (tFill - cFill) * .14; cY += (tY - cY) * .14; if (fill) fill.style.height = (cFill * 100).toFixed(2) + '%'; if (yearEl) yearEl.style.transform = `translate(-50%, ${cY.toFixed(1)}px)`; if (Math.abs(tFill - cFill) > .0005 || Math.abs(tY - cY) > .3) raf = requestAnimationFrame(tick); else raf = null; };
    const upd = measure;
    const rio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: .15 }) : null; items.forEach(el => rio ? rio.observe(el) : el.classList.add('in'));
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
    // 카드 클릭/키보드 → 포커스 + 이동
    items.forEach((el) => { el.addEventListener('click', () => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }); });
    cells.forEach((c) => { const go = () => { const first = items.find(el => el.dataset.pi === c.dataset.pi); if (!first) return; first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.classList.add('flash'); setTimeout(() => first.classList.remove('flash'), 1200); }; c.addEventListener('click', go); c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
    // 커서 따라 살짝 기울기(정밀 포인터만)
    if (matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tl2.addEventListener('mousemove', (e) => { const el = e.target.closest('.tl2-card'); if (!el) return; const b = el.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; el.style.transform = `perspective(700px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-3px)`; });
      tl2.addEventListener('mouseout', (e) => { const el = e.target.closest('.tl2-card'); if (el) el.style.transform = ''; });
    }
  }
  // 골프장 지도: 시·도 클릭 → 목록·카드 필터(다시 누르면 전체), 호버 툴팁(골프장 수), 칩 연동, ?sido= 초기값
  const km = $('.kmap');
  if (km) {
    const box = $('.kmap-box'), items = $$('#kmapUl li'), cards = $$('.club-grid .club-card'), chips = $$('.kmap-chips .chip'), title = $('#kmapTitle'), empty = $('#kmapEmpty');
    let SHORT = {}; try { SHORT = JSON.parse(box.dataset.short || '{}'); } catch (_) { /* no-op */ }
    const counts = {}; items.forEach(li => { const sd = li.dataset.sido; if (sd) counts[sd] = (counts[sd] || 0) + 1; });
    const regions = Array.from(km.querySelectorAll('.km-r')); regions.forEach(p => { if (counts[p.dataset.region]) p.classList.add('has'); });
    const tip = document.createElement('div'); tip.className = 'kmap-tip'; box.appendChild(tip);
    let cur = '';
    const apply = (sd) => { cur = sd; regions.forEach(p => p.classList.toggle('active', !!sd && p.dataset.region === sd)); chips.forEach(c => c.classList.toggle('active', (c.dataset.sido || '') === sd)); let n = 0; items.forEach(li => { const on = !sd || li.dataset.sido === sd; li.hidden = !on; if (on) n++; }); cards.forEach(c => { c.hidden = !!sd && c.dataset.sido !== sd; }); if (title) title.innerHTML = `${sd ? (SHORT[sd] || sd) + ' 골프장' : '전체 골프장'} <small>${n}</small>`; if (empty) empty.hidden = n > 0; };
    km.addEventListener('click', (e) => { const p = e.target.closest('.km-r'); if (!p) return; const sd = p.dataset.region; apply(cur === sd ? '' : sd); if (innerWidth < 900) { const l = $('#kmapList'); l && l.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    km.addEventListener('mousemove', (e) => { const p = e.target.closest('.km-r'); if (!p) { tip.classList.remove('show'); return; } const r = box.getBoundingClientRect(); tip.textContent = `${SHORT[p.dataset.region] || p.dataset.region} ${counts[p.dataset.region] || 0}곳`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.classList.add('show'); });
    km.addEventListener('mouseleave', () => tip.classList.remove('show'));
    chips.forEach(c => c.addEventListener('click', () => apply(c.dataset.sido || '')));
    const initial = new URLSearchParams(location.search).get('sido'); if (initial) apply(initial);
  }

  // 매매신청 URL 파라미터 → 폼 프리필
  const params = new URLSearchParams(location.search); if (params.get('item')) { const i = $('input[name=item]'); if (i && !i.value) i.value = params.get('item'); }
})();
