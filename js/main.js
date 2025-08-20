// 원페이지 스냅 + 홈 이후 섹션에서 좌측 네비 슬라이드 인
// - 휠/터치/키보드/내비 클릭 모두 섹션 단위 이동
// - 홈(index 0)에서는 상단 네비 표시, 그 외에는 좌측 네비 표시

(function () {
  const sections = Array.from(document.querySelectorAll('header[id], section.section'));
  if (sections.length === 0) return;

  // 상단 & 좌측 내비의 모든 링크를 한 번에 처리
  const allNavLinks = Array.from(document.querySelectorAll('.nav-menu a, .side-nav a'));

  let index = 0;
  let isAnimating = false;
  const ANIM_MS = 800;
  const SWIPE_THRESHOLD = 50;

  // 각 섹션 높이 보정(한 화면에 하나)
  function syncSectionHeights() {
    const vh = window.innerHeight;
    sections.forEach(sec => { sec.style.minHeight = vh + 'px'; });
  }
  syncSectionHeights();
  window.addEventListener('resize', syncSectionHeights);

  // 레이아웃 모드 전환: 홈이면 상단 네비, 아니면 좌측 네비
  function updateLayoutMode() {
    if (index > 0) {
      document.body.classList.add('mode-side');
    } else {
      document.body.classList.remove('mode-side');
    }
  }

  // 내비 활성 상태(두 네비 모두 갱신)
  function updateAriaCurrent(id) {
    if (!id) return;
    allNavLinks.forEach(a => a.removeAttribute('aria-current'));
    const targets = allNavLinks.filter(a => a.getAttribute('href') === '#' + id);
    targets.forEach(a => a.setAttribute('aria-current', 'page'));
  }

  // 스냅 이동
  function snapTo(i, behavior = 'smooth') {
    const clamped = Math.max(0, Math.min(i, sections.length - 1));
    index = clamped;
    isAnimating = true;

    const target = sections[clamped];
    const top = Math.round(target.getBoundingClientRect().top + window.pageYOffset);
    window.scrollTo({ top, behavior });

    updateAriaCurrent(target.id);
    updateLayoutMode();

    if (target.id) history.replaceState(null, '', '#' + target.id);
    setTimeout(() => { isAnimating = false; }, ANIM_MS);
  }

  // 화면 중앙과 가장 가까운 섹션
  function nearestIndex() {
    const mid = window.pageYOffset + window.innerHeight / 2;
    let best = 0, bestDist = Infinity;
    sections.forEach((sec, i) => {
      const center = sec.offsetTop + sec.offsetHeight / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }

  // 초기 정렬(부분 보임 방지)
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (location.hash) {
        const target = document.querySelector(location.hash);
        const i = target ? sections.indexOf(target) : 0;
        snapTo(i >= 0 ? i : 0, 'auto');
      } else {
        snapTo(0, 'auto');
      }
    }, 0);
  });

  // 내비 링크 클릭 → 스냅
  allNavLinks.forEach(a => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href');
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      const i = sections.indexOf(target);
      if (i >= 0) snapTo(i);
    });
  });

  // 휠(트랙패드 포함)
  window.addEventListener('wheel', (e) => {
    if (isAnimating) return;
    e.preventDefault();

    const dir = e.deltaY > 0 ? 1 : -1;
    const near = nearestIndex();
    if (near !== index) index = near;

    snapTo(index + dir);
  }, { passive: false });

  // 키보드
  window.addEventListener('keydown', (e) => {
    if (isAnimating) return;

    const key = e.key;
    let handled = true;
    if (key === 'ArrowDown' || key === 'PageDown' || key === ' ') {
      snapTo(index + 1);
    } else if (key === 'ArrowUp' || key === 'PageUp') {
      snapTo(index - 1);
    } else if (key === 'Home') {
      snapTo(0);
    } else if (key === 'End') {
      snapTo(sections.length - 1);
    } else {
      handled = false;
    }
    if (handled) e.preventDefault();
  });

  // 터치 스와이프
  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isAnimating) e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (touchStartY == null || isAnimating) return;
    const endY = (e.changedTouches[0] || {}).clientY ?? touchStartY;
    const delta = endY - touchStartY;

    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      const dir = delta < 0 ? 1 : -1;
      snapTo(index + dir);
    } else {
      snapTo(nearestIndex());
    }
    touchStartY = null;
  });

  // 보조: 관찰 중인 섹션이 보이면 인덱스/내비 업데이트
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const i = sections.indexOf(entry.target);
      if (i >= 0) {
        index = i;
        updateAriaCurrent(entry.target.id);
        updateLayoutMode();
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: [0.25, 0.5, 0.75] });
  sections.forEach(sec => io.observe(sec));
})();
