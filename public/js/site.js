/* 하나회원권거래소 — 인터랙션(카운터·스크롤 리빌·시세 필터·비교·추이 모달·FAQ·폼·유튜브) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // 헤더·모바일 메뉴·맨 위로
  const header = $('#header'); const burger = $('#burger'); const mnav = $('#mobileNav'); const toTop = $('#toTop');
  const onScroll = () => { header && header.classList.toggle('scrolled', window.scrollY > 8); toTop && toTop.classList.toggle('show', window.scrollY > 500); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  burger && burger.addEventListener('click', () => { const open = !mnav.classList.contains('open'); mnav.classList.toggle('open', open); burger.setAttribute('aria-expanded', String(open)); });
  toTop && toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // 스크롤 리빌
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`; io ? io.observe(el) : el.classList.add('in'); });

  // 카운터
  const cio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(e => { if (!e.isIntersecting) return; const el = e.target; const to = Number(el.dataset.count) || 0; const t0 = performance.now(); const dur = 1400; const step = (t) => { const p = Math.min(1, (t - t0) / dur); const v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v.toLocaleString('ko-KR'); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); cio.unobserve(el); })) : null;
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
    mk.addEventListener('change', (e) => { if (!e.target.classList.contains('cmp-chk')) return; if ($$('.cmp-chk:checked', mk).length > 3) { e.target.checked = false; alert('최대 3개까지 비교할 수 있습니다.'); } renderCmp(); });
    const modal = $('#histModal'); const chart = $('#histChart'); const title = $('#histTitle'); const note = $('#histNote'); const cat = location.pathname.split('/')[2] || 'golf';
    const close = () => { modal.hidden = true; }; $('.modal-close', modal).addEventListener('click', close); modal.addEventListener('click', (e) => { if (e.target === modal) close(); }); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const draw = (hist, name) => { const vals = hist.map(h => h.value); const W = 640, H = 220, P = 36; if (vals.length < 2) { chart.innerHTML = '<p class="note">추이 데이터가 아직 2개 미만입니다. 매주 갱신되며 누적됩니다.</p>'; return; } const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1; const x = (i) => P + i / (vals.length - 1) * (W - P * 2); const y = (v) => H - P + 6 - (v - min) / span * (H - P * 2); const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' '); const up = vals[vals.length - 1] >= vals[0]; const col = up ? '#d0342c' : '#1a63c9'; const grid = [0, .25, .5, .75, 1].map(f => { const v = Math.round(min + span * f); return `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e8f0"/><text x="${P - 6}" y="${y(v) + 4}" font-size="11" fill="#6b7485" text-anchor="end">${v.toLocaleString()}</text>`; }).join(''); const dots = hist.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.value)}" r="3.5" fill="${col}"><title>${h.date}: ${h.value.toLocaleString()}만원</title></circle>`).join(''); const labels = [0, Math.floor((hist.length - 1) / 2), hist.length - 1].map(i => `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="#6b7485" text-anchor="middle">${hist[i].date.slice(5)}</text>`).join(''); chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${name} 시세 추이">${grid}<polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" points="${pts}"/>${dots}${labels}</svg>`; note.textContent = `${hist[0].date} ~ ${hist[hist.length - 1].date} · 최저 ${min.toLocaleString()} · 최고 ${max.toLocaleString()} · 단위 만원`; };
    mk.addEventListener('click', async (e) => { const b = e.target.closest('[data-hist]'); if (!b || b.tagName === 'A') return; e.preventDefault(); const id = b.dataset.hist; const tr = b.closest('tr'); title.textContent = `${tr.dataset.name} 최근 90일 시세 추이`; chart.innerHTML = '<p class="note">불러오는 중…</p>'; modal.hidden = false; try { const r = await fetch(`/api/prices/${cat}/${id}/history?days=90`); const j = await r.json(); draw(j.history, tr.dataset.name); } catch (_) { chart.innerHTML = '<p class="note">추이를 불러오지 못했습니다.</p>'; } });
  }

  // FAQ: 하나 열면 같은 목록의 다른 항목 닫기(선택적 UX)
  $$('.faq-list').forEach(list => list.addEventListener('toggle', (e) => { if (e.target.open) $$('details[open]', list).forEach(d => { if (d !== e.target) d.open = false; }); }, true));

  // 문의 폼 AJAX
  $$('form[data-ajax]').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('.form-msg', form); const btn = $('button[type=submit]', form);
    const data = Object.fromEntries(new FormData(form).entries()); if (!data.agree) { msg.className = 'form-msg err'; msg.textContent = '개인정보 수집·이용에 동의해 주세요.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = '접수 중…';
    try { const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || '오류'); msg.className = 'form-msg ok'; msg.textContent = j.message || '접수되었습니다.'; form.reset(); if (window.gtag) gtag('event', 'generate_lead', { kind: data.kind }); } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; } finally { btn.disabled = false; }
  }));

  // 유튜브 지연 로드
  $$('.yt').forEach(box => box.addEventListener('click', () => { const id = box.dataset.id; box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="YouTube" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`; }));

  // 매매신청 URL 파라미터 → 폼 프리필
  const params = new URLSearchParams(location.search); if (params.get('item')) { const i = $('input[name=item]'); if (i && !i.value) i.value = params.get('item'); }
})();
