// js/main.js — 자연 가로 스크롤 / 레일 / 로더 / 테마 전환 보강(취소/락) + 스크롤-기반 테마 스위칭 + Skills 재생
(function () {
  const hScroll = document.getElementById("h-scroll");
  const panels = Array.from(document.querySelectorAll(".panel"));
  if (!hScroll || !panels.length) return;

  const chapterRail = document.getElementById("chapter-rail");

  let index = 0;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ANIM_MS = 800;

  // =========================
  // 🔶 부드러운 테마 전환(색 보간) — 취소/락 대응
  // =========================
  const VARS_TO_FADE = [
    "--grad-from","--grad-to","--text","--muted","--bg","--bg-elev",
    "--border","--shadow","--primary","--primary-2","--rail-active",
    "--rail-mark","--overlay-bg",
  ];

  let themeRaf = null;         // 진행 중인 rAF
  let themeReqId = 0;          // 마지막 요청 ID
  let themeTargetClass = null; // 'theme-sky' 등, 현재 목표
  let themeLockUntil = 0;      // 이 시간 전 IO는 테마 못 바꿈

  function toRGBA(str) {
    const d = document.createElement("div");
    d.style.color = str;
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    document.body.removeChild(d);
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!m) return [0, 0, 0, 1];
    return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10), m[4] === undefined ? 1 : parseFloat(m[4])];
  }
  const mixColor = (aStr, bStr, t) => {
    const a = toRGBA(aStr), b = toRGBA(bStr);
    const lerp = (x,y)=> x + (y-x)*t;
    return `rgba(${Math.round(lerp(a[0],b[0]))}, ${Math.round(lerp(a[1],b[1]))}, ${Math.round(lerp(a[2],b[2]))}, ${(+lerp(a[3],b[3]).toFixed(4))})`;
  };

  function smoothThemeSwitch(nextTheme, duration = REDUCED ? 0 : 800) {
    const body = document.body;
    const prevThemeClass = (body.className.match(/theme-\w+/) || [null])[0];
    const nextThemeClass = "theme-" + nextTheme;

    // 동일 타겟으로 진행 중이면 무시
    if (themeTargetClass === nextThemeClass && themeRaf !== null) return;
    // 애니 없음 + 이미 적용되어 있으면 무시
    if (!themeRaf && prevThemeClass === nextThemeClass) return;

    // 진행 중이면 취소
    if (themeRaf !== null) { cancelAnimationFrame(themeRaf); themeRaf = null; }

    themeTargetClass = nextThemeClass;
    const myId = ++themeReqId;

    // 현재 값을 old로 스냅샷
    const oldVals = {};
    const csOld = getComputedStyle(body);
    VARS_TO_FADE.forEach(v => oldVals[v] = csOld.getPropertyValue(v).trim() || "");

    // next 값을 읽기 위해 잠깐 적용
    if (prevThemeClass) body.classList.remove(prevThemeClass);
    body.classList.add(nextThemeClass);
    const csNew = getComputedStyle(body);
    const newVals = {};
    VARS_TO_FADE.forEach(v => newVals[v] = csNew.getPropertyValue(v).trim() || "");
    // 복원
    body.classList.remove(nextThemeClass);
    if (prevThemeClass) body.classList.add(prevThemeClass);

    if (duration === 0) {
      body.classList.remove(prevThemeClass);
      body.classList.add(nextThemeClass);
      VARS_TO_FADE.forEach(v => body.style.removeProperty(v));
      return;
    }

    const start = performance.now();
    const step = (now) => {
      if (myId !== themeReqId) return; // 더 최신 요청이 있으면 중단

      const t = Math.min(1, (now - start) / duration);
      VARS_TO_FADE.forEach(v => {
        const from = oldVals[v], to = newVals[v];
        if (!from || !to) return;
        if (/^#|rgb|hsl|oklch|oklab|color-mix/i.test(from) || /^#|rgb|hsl|oklch|oklab|color-mix/i.test(to)) {
          try { document.body.style.setProperty(v, mixColor(from, to, t)); }
          catch { if (t === 1) document.body.style.setProperty(v, to); }
        } else if (t === 1) {
          document.body.style.setProperty(v, to);
        }
      });

      if (t < 1) {
        themeRaf = requestAnimationFrame(step);
      } else {
        document.body.classList.remove(prevThemeClass);
        document.body.classList.add(nextThemeClass);
        VARS_TO_FADE.forEach(v => document.body.style.removeProperty(v));
        themeRaf = null;
      }
    };
    themeRaf = requestAnimationFrame(step);
  }
  function setThemeFor(targetSec, withLock=false){
    const t = targetSec?.dataset.theme || "sky";
    smoothThemeSwitch(t, ANIM_MS);
    if (withLock) themeLockUntil = Date.now() + ANIM_MS;
  }

  // ----------- Loader ----------- //
  const loader = document.getElementById("loader");
  function finishLoader(){
    loader?.classList.add("is-done");
    const hash = location.hash;
    const target = hash ? document.querySelector(hash) : null;
    const first = target || panels[0];

    hScroll.scrollTo({ left:first.offsetLeft, behavior:"auto" });
    first.classList.add("reveal-on");
    setThemeFor(first);
    currentThemeIndex = panels.indexOf(first);
    updateRail();
  }
  window.addEventListener("load", () => setTimeout(finishLoader, REDUCED ? 50 : 1500));

  // ----------- 레일 ----------- //
  const LABELS = ["Home","Profile","Skills","Projects","Contact"];
  function buildRail(){
    if (!chapterRail) return;
    chapterRail.innerHTML = `
      <div class="rail">
        <div class="rail-line"><div class="rail-progress"></div></div>
        <div class="rail-labels"></div>
      </div>
    `;
    const rail = chapterRail.querySelector(".rail");
    const line = rail.querySelector(".rail-line");
    const labelsEl = rail.querySelector(".rail-labels");

    panels.forEach((sec, i) => {
      const frac = (panels.length === 1) ? 0 : (i / (panels.length - 1));
      const leftPct = frac * 100;

      const m = document.createElement("div");
      m.className = "rail-marker";
      m.style.left = `calc(${leftPct}% )`;
      line.appendChild(m);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = LABELS[i] || sec.id || `Section ${i+1}`;
      btn.dataset.index = i;
      btn.style.left = `calc(${leftPct}% )`;
      btn.addEventListener("click", () => {
        // 클릭 시 해당 섹션으로 스크롤 + 테마 즉시 요청(락 포함)
        setThemeFor(sec, true);
        hScroll.scrollTo({ left: Math.round(sec.offsetLeft), behavior: REDUCED ? "auto" : "smooth" });
        if (sec.id === "skills") setTimeout(restartSkillsOnEnter, 300);
      });
      labelsEl.appendChild(btn);
    });

    updateRail();
  }
  buildRail();

  function nearestIndex(){
    const mid = hScroll.scrollLeft + hScroll.clientWidth/2;
    let best = 0, bestDist = Infinity;
    panels.forEach((sec,i)=>{
      const center = sec.offsetLeft + sec.offsetWidth/2;
      const d = Math.abs(center - mid);
      if (d < bestDist){ best = i; bestDist = d; }
    });
    return best;
  }
  function updateRail(){
    const rail = chapterRail?.querySelector(".rail");
    const line = rail?.querySelector(".rail-line");
    const prog = line?.querySelector(".rail-progress");
    const labels = rail?.querySelectorAll(".rail-labels button") || [];
    if (!rail || !line || !prog) return;

    const maxScroll = (hScroll.scrollWidth - hScroll.clientWidth) || 1;
    const frac = Math.min(1, hScroll.scrollLeft / maxScroll);
    prog.style.left = `calc(${(frac*100).toFixed(5)}%)`;

    const cur = nearestIndex();
    labels.forEach((b)=> b.removeAttribute("aria-current"));
    rail.querySelector(`.rail-labels button[data-index="${cur}"]`)?.setAttribute("aria-current","page");
  }

  // =====================================================
  // 🔶 Skills: 진입 시마다 접고 → 순차 펼침
  // =====================================================
  let skillsPrepared = false;
  let skillsAnimating = false;
  let skillsVisible = false;

  function prepareSkills(){
    const sec = document.getElementById("skills");
    if (!sec) return;
    const cards = Array.from(sec.querySelectorAll(".skill-card"));

    cards.forEach((card)=>{
      const body = card.querySelector(".skill-body");
      if (body){
        body.style.opacity = "0";
        body.style.transform = "translateY(6px)";
        body.style.transition = "opacity 420ms ease, transform 420ms ease";
      }
      const cs = getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const h3 = card.querySelector("h3");
      const h3h = h3 ? h3.getBoundingClientRect().height : 28;
      const collapsed = Math.round(h3h + pt + pb + 10);

      const prev = card.style.transition || "";
      if (!prev.includes("max-height")){
        card.style.transition = (prev ? prev + ", " : "") + "max-height 600ms cubic-bezier(.22,.9,.2,1)";
      }
      card.style.overflow = "hidden";
      card.style.maxHeight = collapsed + "px";
      card.classList.remove("is-expanded");
    });

    skillsPrepared = true;
    skillsAnimating = false;
  }
  function expandCard(card){
    void card.offsetHeight;
    const full = card.scrollHeight;
    card.style.maxHeight = full + "px";

    const body = card.querySelector(".skill-body");
    const done = () => {
      card.removeEventListener("transitionend", onEnd);
      if (body){ body.style.opacity = "1"; body.style.transform = "none"; }
      card.classList.add("is-expanded");
      setTimeout(()=>{ card.style.maxHeight = ""; }, 20);
    };
    const onEnd = (e)=>{ if (e.propertyName === "max-height") done(); };
    card.addEventListener("transitionend", onEnd);
    setTimeout(done, 750);
  }
  function animateSkills(){
    if (skillsAnimating) return;
    const sec = document.getElementById("skills"); if (!sec) return;
    const cards = Array.from(sec.querySelectorAll(".skill-card"));
    const STAGGER = REDUCED ? 0 : 220;

    skillsAnimating = true;
    cards.forEach((card,i)=>{
      setTimeout(()=>{
        if (REDUCED){
          card.style.maxHeight = "";
          card.classList.add("is-expanded");
          const body = card.querySelector(".skill-body");
          if (body){ body.style.opacity = "1"; body.style.transform = "none"; }
        } else {
          expandCard(card);
        }
      }, i*STAGGER);
    });
  }
  function restartSkillsOnEnter(){ prepareSkills(); requestAnimationFrame(animateSkills); }

  // ----------- 자연 스크롤 & 스크롤-기반 테마 스위칭 ----------- //
  hScroll.addEventListener("wheel", (e)=>{
    if (isInsideNestedScrollable(e.target)) return;
    hScroll.scrollLeft += e.deltaY + e.deltaX;
    e.preventDefault();
    updateRail();
    requestThemeCheck(); // 스크롤 시 테마 체크
  }, { passive:false });

  // 스크롤 이벤트 → rAF로 테마 스위칭(뷰포트 중앙 기준)
  let scrollRaf = null;
  let currentThemeIndex = -1;
  function requestThemeCheck(){
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(()=>{
      scrollRaf = null;
      updateRail();

      const near = nearestIndex();
      if (near !== currentThemeIndex && Date.now() >= themeLockUntil){
        currentThemeIndex = near;
        setThemeFor(panels[near]);   // 방향 무관 대칭 전환
      }
    });
  }
  hScroll.addEventListener("scroll", requestThemeCheck, { passive:true });

  const INPUT_TAGS = new Set(["INPUT","TEXTAREA","SELECT"]);
  window.addEventListener("keydown", (e)=>{
    const active = document.activeElement;
    if (active && (INPUT_TAGS.has(active.tagName) || active.isContentEditable)) return;

    const key = e.key;
    const page = Math.round(hScroll.clientWidth * 0.9);
    let handled = true;

    if (key === "ArrowRight" || key === "PageDown" || key === " ") {
      hScroll.scrollLeft += page;
    } else if (key === "ArrowLeft" || key === "PageUp") {
      hScroll.scrollLeft -= page;
    } else if (key === "Home") {
      hScroll.scrollLeft = 0;
    } else if (key === "End") {
      hScroll.scrollLeft = hScroll.scrollWidth;
    } else {
      handled = false;
    }
    if (handled){ e.preventDefault(); requestThemeCheck(); }
  });

  function isInsideNestedScrollable(el){
    let n = el;
    while (n && n !== hScroll){
      const cs = getComputedStyle(n);
      const oy = cs.overflowY, ox = cs.overflowX;
      const canY = (oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight;
      const canX = (ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth;
      if (canY || canX) return true;
      n = n.parentElement;
    }
    return false;
  }

  // ----------- IntersectionObserver ----------- //
  // ⬇️ 테마 전환은 제거하고 reveal/skills/contact만 담당
  const io = new IntersectionObserver((entries)=>{
    entries.forEach((entry)=>{
      if (entry.isIntersecting && entry.intersectionRatio >= 0.2){
        entry.target.classList.add("reveal-on");
      }
      if (entry.target.id === "skills"){
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55 && !skillsVisible){
          skillsVisible = true;
          restartSkillsOnEnter();
        } else if (!entry.isIntersecting && skillsVisible){
          skillsVisible = false;
        }
      }
      if (entry.target.id === "contact"){
        const r = entry.intersectionRatio;
        let step = 0;
        if (r > 0.2) step = 1;
        if (r > 0.45) step = 2;
        if (r > 0.7) step = 3;
        if (r > 0.9) step = 4;
        applyContactStep(step);
      }
    });
  }, { root:hScroll, threshold:[0.2, 0.35, 0.55, 0.75, 0.9] });
  panels.forEach(sec => io.observe(sec));

  function applyContactStep(step){
    const ct = document.getElementById("contact");
    if (!ct) return;
    ct.classList.remove("step-0","step-1","step-2","step-3","step-4");
    ct.classList.add("step-" + step);
  }

  // 해시 이동: 스크롤 + 테마 즉시 적용(락)
  window.addEventListener("hashchange", ()=>{
    const target = document.querySelector(location.hash);
    if (!target) return;
    setThemeFor(target, true);
    hScroll.scrollTo({ left: target.offsetLeft, behavior: REDUCED ? "auto" : "smooth" });
    target.classList.add("reveal-on");
    currentThemeIndex = panels.indexOf(target);
    if (target.id === "skills") setTimeout(restartSkillsOnEnter, 200);
  });

  // ----------- Projects Overlay (그대로) ----------- //
  const overlay = document.getElementById("projects-overlay");
  const seeAllBtn = document.getElementById("btn-see-all");
  const ovBack = document.getElementById("btn-ov-back");
  const ovChips = Array.from(document.querySelectorAll("#projects-overlay .chip"));
  const ovGrid = document.querySelector("#projects-overlay .ov-grid");
  const preview = document.getElementById("project-preview");

  function openOverlayWithFly(){
    if (!overlay || !preview) { overlay?.classList.add("is-open"); return; }
    const thumb = preview.querySelector(".thumb");
    const rect = thumb.getBoundingClientRect();
    const clone = thumb.cloneNode(true);
    Object.assign(clone.style, {
      position:"fixed", left: rect.left + "px", top: rect.top + "px",
      width: rect.width + "px", height: rect.height + "px",
      margin:0, zIndex:3001, border:"1px solid rgba(255,255,255,.25)"
    });
    document.body.appendChild(clone);
    overlay.classList.add("is-open");

    const targetLeft = Math.max(24, (window.innerWidth - Math.min(1200, window.innerWidth*0.9))/2 + 18);
    const targetTop  = Math.max(24, (window.innerHeight - (window.innerHeight*0.86))/2 + 74);

    clone.animate([
      { transform:"translate(0,0) scale(1)", filter:"brightness(1)", opacity:1 },
      { transform:`translate(${targetLeft-rect.left}px, ${targetTop-rect.top}px) scale(.9)`, filter:"brightness(1.08)", opacity:.98 }
    ], { duration:600, easing:"cubic-bezier(.22,.9,.2,1)", fill:"forwards" })
    .addEventListener("finish", ()=>{ clone.remove(); });
  }
  function closeOverlay(){ overlay?.classList.remove("is-open"); }

  seeAllBtn?.addEventListener("click", openOverlayWithFly);
  ovBack?.addEventListener("click", closeOverlay);

  ovChips.forEach(ch => ch.addEventListener("click", ()=>{
    ovChips.forEach(c => { c.classList.remove("is-active"); c.setAttribute("aria-selected","false"); });
    ch.classList.add("is-active"); ch.setAttribute("aria-selected","true");
    const f = ch.dataset.filter;
    Array.from(ovGrid.children).forEach(card => {
      const cat = card.getAttribute("data-cat");
      card.style.display = (f === "all" || f === cat) ? "" : "none";
    });
  }));

  // 초기: Skills 접어두기
  prepareSkills();
})();
