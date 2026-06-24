/* ============================================================
   Nuvio Landing Page — Scripts
   Vanilla JS, no frameworks
   ============================================================ */

(() => {
    'use strict';

    /* ─── Config ─── */
    const CATALOG_URL = 'https://nuviostreamapi.vercel.app/nuvio_2xa56et/catalog/movie/cinemeta___top.json';
    const POSTER_BASE = 'https://images.metahub.space/poster/medium';
    const BACKDROP_BASE = 'https://images.metahub.space/background/medium';

    /* ─── Hero Backdrop Carousel ─── */
    const heroMovies = [
        { title: 'Project Hail Mary', imdbId: 'tt12042730', year: '2026', genre: 'Sci-Fi' },
        { title: 'Michael', imdbId: 'tt11378946', year: '2026', genre: 'Biopic' },
        { title: 'Masters of the Universe', imdbId: 'tt0427340', year: '2026', genre: 'Action' },
        { title: 'Pressure', imdbId: 'tt32547691', year: '2026', genre: 'Thriller' },
        { title: 'The Death of Robin Hood', imdbId: 'tt32273171', year: '2026', genre: 'Adventure' }
    ];

    let heroTimer = null;
    let heroCurrent = 0;

    function initHeroCarousel() {
        const container = document.getElementById('heroBackdrops');
        const indicatorsWrap = document.getElementById('heroIndicators');
        const previewPoster = document.getElementById('previewPoster');
        const previewTitle = document.getElementById('previewTitle');
        const previewMeta = document.getElementById('previewMeta');
        const previewProgress = document.getElementById('previewProgress');
        if (!container) return;

        // Build backdrops
        heroMovies.forEach((movie, i) => {
            const img = document.createElement('img');
            img.src = `${BACKDROP_BASE}/${movie.imdbId}/img`;
            img.alt = movie.title;
            if (i === 0) img.classList.add('active');
            container.appendChild(img);
        });

        const slides = container.querySelectorAll('img');

        // Build indicators
        if (indicatorsWrap) {
            heroMovies.forEach((_, i) => {
                const btn = document.createElement('button');
                btn.className = 'indicator' + (i === 0 ? ' active' : '');
                btn.setAttribute('aria-label', `Show ${heroMovies[i].title}`);
                btn.addEventListener('click', () => switchSlide(i, true));
                indicatorsWrap.appendChild(btn);
            });
        }

        const indicators = indicatorsWrap ? indicatorsWrap.querySelectorAll('.indicator') : [];

        function updatePreviewCard(index) {
            const movie = heroMovies[index];
            if (previewPoster) {
                previewPoster.style.backgroundImage = `url(${POSTER_BASE}/${movie.imdbId}/img)`;
            }
            if (previewTitle) {
                previewTitle.style.opacity = '0';
                previewTitle.style.transform = 'translateY(8px)';
                setTimeout(() => {
                    previewTitle.textContent = movie.title;
                    previewTitle.style.opacity = '1';
                    previewTitle.style.transform = 'translateY(0)';
                }, 200);
            }
            if (previewMeta) {
                previewMeta.textContent = `${movie.year} · ${movie.genre}`;
            }
        }

        function animateProgress() {
            if (!previewProgress) return;
            previewProgress.style.transition = 'none';
            previewProgress.style.width = '0%';
            void previewProgress.offsetWidth;
            previewProgress.style.transition = 'width 5s linear';
            previewProgress.style.width = '100%';
        }

        function switchSlide(index, manual = false) {
            slides[heroCurrent].classList.remove('active');
            if (indicators[heroCurrent]) indicators[heroCurrent].classList.remove('active');
            heroCurrent = index;
            slides[heroCurrent].classList.add('active');
            if (indicators[heroCurrent]) indicators[heroCurrent].classList.add('active');
            // Re-trigger Ken Burns
            slides[heroCurrent].style.animation = 'none';
            void slides[heroCurrent].offsetWidth;
            slides[heroCurrent].style.animation = '';
            updatePreviewCard(heroCurrent);
            animateProgress();
            if (manual) {
                clearInterval(heroTimer);
                heroTimer = setInterval(() => switchSlide((heroCurrent + 1) % heroMovies.length), 5000);
            }
        }

        updatePreviewCard(0);
        animateProgress();
        heroTimer = setInterval(() => switchSlide((heroCurrent + 1) % heroMovies.length), 5000);

        // Touch swipe on hero
        let touchStartX = 0;
        container.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        container.addEventListener('touchend', e => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                const next = diff > 0
                    ? (heroCurrent + 1) % heroMovies.length
                    : (heroCurrent - 1 + heroMovies.length) % heroMovies.length;
                switchSlide(next, true);
            }
        }, { passive: true });
    }

    /* ─── Fallback Movie List ─── */
    const FALLBACK_MOVIES = [
        { id: 'tt12042730', name: 'Project Hail Mary', releaseInfo: '2026', imdbRating: '8.3' },
        { id: 'tt11378946', name: 'Michael', releaseInfo: '2026', imdbRating: '7.7' },
        { id: 'tt0427340', name: 'Masters of the Universe', releaseInfo: '2026', imdbRating: null },
        { id: 'tt32547691', name: 'Pressure', releaseInfo: '2026', imdbRating: '7.7' },
        { id: 'tt32273171', name: 'The Death of Robin Hood', releaseInfo: '2026', imdbRating: '7.4' },
        { id: 'tt1517268', name: 'Superman', releaseInfo: '2025', imdbRating: '7.5' },
        { id: 'tt26743210', name: 'A Minecraft Movie', releaseInfo: '2025', imdbRating: '6.0' },
        { id: 'tt10375624', name: 'Voicemails for Isabelle', releaseInfo: '2026', imdbRating: '7.7' },
        { id: 'tt9362722', name: 'Jurassic World Rebirth', releaseInfo: '2025', imdbRating: '6.4' },
        { id: 'tt6791350', name: 'Guardians of the Galaxy Vol. 3', releaseInfo: '2023', imdbRating: '7.9' },
        { id: 'tt1517269', name: 'The Brutalist', releaseInfo: '2024', imdbRating: '7.3' },
        { id: 'tt9362930', name: 'Mission: Impossible — The Final Reckoning', releaseInfo: '2025', imdbRating: '7.4' },
        { id: 'tt9603212', name: 'Mission: Impossible — Dead Reckoning', releaseInfo: '2023', imdbRating: '7.6' },
        { id: 'tt9362710', name: 'Twisters', releaseInfo: '2024', imdbRating: '6.7' },
        { id: 'tt5950044', name: 'Inside Out 2', releaseInfo: '2024', imdbRating: '7.6' },
        { id: 'tt22066032', name: 'Wicked', releaseInfo: '2024', imdbRating: '7.5' },
        { id: 'tt2906216', name: 'Wonka', releaseInfo: '2023', imdbRating: '7.0' },
        { id: 'tt6334354', name: 'Dune: Part Two', releaseInfo: '2024', imdbRating: '8.5' },
        { id: 'tt9362722', name: 'Carry-On', releaseInfo: '2024', imdbRating: '6.8' },
        { id: 'tt6791350', name: 'Oppenheimer', releaseInfo: '2023', imdbRating: '8.3' }
    ];

    /* ─── Top Movies Row ─── */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ─── Movie Modal ─── */
    function openMovieModal(m) {
        const existing = document.getElementById('movieModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'movieModal';
        modal.className = 'movie-modal';
        modal.innerHTML = `
            <div class="movie-modal-backdrop"></div>
            <div class="movie-modal-card">
                <button class="movie-modal-close" aria-label="Close">✕</button>
                <div class="movie-modal-poster" style="background-image: url(${POSTER_BASE}/${encodeURIComponent(m.id)}/img)"></div>
                <div class="movie-modal-info">
                    <h3>${escapeHtml(m.name)}</h3>
                    <p class="movie-modal-meta">${m.releaseInfo || ''} ${m.imdbRating ? '· ★ ' + m.imdbRating : ''}</p>
                    <a href="#pricing" class="btn btn-primary btn-block movie-modal-cta">Watch on Nuvio — 7 Days Free →</a>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('open'));

        const close = () => {
            modal.classList.remove('open');
            setTimeout(() => modal.remove(), 300);
        };
        modal.querySelector('.movie-modal-close').addEventListener('click', close);
        modal.querySelector('.movie-modal-backdrop').addEventListener('click', close);
        modal.querySelector('.movie-modal-cta').addEventListener('click', close);
    }

    function renderMovieRow(metas) {
        const row = document.getElementById('movieRow');
        if (!row) return;
        row.innerHTML = '';

        metas.slice(0, 20).forEach((m, i) => {
            const rating = m.imdbRating
                ? `<span class="movie-rating">★ ${escapeHtml(String(m.imdbRating))}</span>`
                : '';
            const year = m.releaseInfo ? escapeHtml(String(m.releaseInfo)) : '';

            const card = document.createElement('div');
            card.className = 'movie-card';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.innerHTML = `
                <img src="${POSTER_BASE}/${encodeURIComponent(m.id)}/img" alt="${escapeHtml(m.name)}" loading="lazy">
                <span class="movie-rank">${i + 1}</span>
                <div class="movie-play">▶</div>
                <div class="movie-overlay">
                    <div class="movie-title">${escapeHtml(m.name)}</div>
                    <div class="movie-meta">${year}${rating ? ' · ' + rating : ''}</div>
                </div>
            `;
            card.addEventListener('click', () => openMovieModal(m));
            card.addEventListener('keypress', e => { if (e.key === 'Enter') openMovieModal(m); });
            row.appendChild(card);
        });

        // Touch drag-to-scroll for mobile
        initTouchDrag(row);
    }

    /* ─── Touch drag-to-scroll ─── */
    function initTouchDrag(el) {
        let isDown = false, startX = 0, scrollLeft = 0;
        el.addEventListener('mousedown', e => {
            isDown = true;
            el.classList.add('dragging');
            startX = e.pageX - el.offsetLeft;
            scrollLeft = el.scrollLeft;
        });
        el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('dragging'); });
        el.addEventListener('mouseup', () => { isDown = false; el.classList.remove('dragging'); });
        el.addEventListener('mousemove', e => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - el.offsetLeft;
            el.scrollLeft = scrollLeft - (x - startX) * 1.5;
        });
    }

    async function loadMovies() {
        try {
            const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && Array.isArray(data.metas) && data.metas.length > 0) {
                renderMovieRow(data.metas);
                return;
            }
            throw new Error('Empty metas');
        } catch (err) {
            console.warn('[Nuvio] Cinemeta fetch failed, using fallback list:', err.message);
            renderMovieRow(FALLBACK_MOVIES);
        }
    }

    /* ─── Movie Row Scroll Arrows ─── */
    function initScrollArrows() {
        const row = document.getElementById('movieRow');
        const left = document.getElementById('scrollLeft');
        const right = document.getElementById('scrollRight');
        if (!row || !left || !right) return;
        left.addEventListener('click', () => row.scrollBy({ left: -440, behavior: 'smooth' }));
        right.addEventListener('click', () => row.scrollBy({ left: 440, behavior: 'smooth' }));

        // Show/hide arrows based on scroll position
        const updateArrows = () => {
            left.style.opacity = row.scrollLeft > 0 ? '1' : '0';
            right.style.opacity = row.scrollLeft < row.scrollWidth - row.clientWidth - 10 ? '1' : '0';
        };
        row.addEventListener('scroll', updateArrows, { passive: true });
        updateArrows();
    }

    /* ─── FAQ Accordion ─── */
    function initFaq() {
        const items = document.querySelectorAll('.faq-item');
        items.forEach(item => {
            const btn = item.querySelector('.faq-question');
            if (!btn) return;
            btn.addEventListener('click', () => {
                const isOpen = item.classList.contains('open');
                items.forEach(other => {
                    other.classList.remove('open');
                    const ob = other.querySelector('.faq-question');
                    if (ob) ob.setAttribute('aria-expanded', 'false');
                });
                if (!isOpen) {
                    item.classList.add('open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }

    /* ─── Navbar Scroll State ─── */
    function initNavbar() {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;
        const onScroll = () => {
            if (window.scrollY > 20) navbar.classList.add('scrolled');
            else navbar.classList.remove('scrolled');
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ─── Scroll-triggered Animations ─── */
    function initScrollAnimations() {
        const elements = document.querySelectorAll('.animate-on-scroll');
        if (!('IntersectionObserver' in window)) {
            elements.forEach(el => el.classList.add('visible'));
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
        elements.forEach(el => observer.observe(el));
    }

    /* ─── Animated Stat Counters ─── */
    function animateCounter(el) {
        const target = parseFloat(el.dataset.target);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const isFloat = el.dataset.float === 'true';
        const duration = 1800;
        const start = performance.now();

        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = target * eased;
            el.textContent = prefix + (isFloat ? value.toFixed(2) : Math.floor(value).toLocaleString()) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function initCounters() {
        const counters = document.querySelectorAll('[data-target]');
        if (!('IntersectionObserver' in window)) {
            counters.forEach(el => animateCounter(el));
            return;
        }
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.animated) {
                    entry.target.dataset.animated = 'true';
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        counters.forEach(el => observer.observe(el));
    }

    /* ─── Channel card tap-to-highlight on mobile ─── */
    function initChannelCards() {
        const cards = document.querySelectorAll('.channel-card');
        cards.forEach(card => {
            card.addEventListener('touchstart', () => card.classList.add('tapped'), { passive: true });
            card.addEventListener('touchend', () => {
                setTimeout(() => card.classList.remove('tapped'), 600);
            }, { passive: true });
        });
    }

    /* ─── Floating particles in hero ─── */
    function initParticles() {
        const hero = document.querySelector('.hero');
        if (!hero) return;
        const canvas = document.createElement('canvas');
        canvas.className = 'hero-particles';
        hero.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let W, H, particles = [];

        function resize() {
            W = canvas.width = hero.offsetWidth;
            H = canvas.height = hero.offsetHeight;
        }

        function createParticle() {
            return {
                x: Math.random() * W,
                y: Math.random() * H,
                r: Math.random() * 2 + 0.5,
                dx: (Math.random() - 0.5) * 0.3,
                dy: -Math.random() * 0.4 - 0.1,
                alpha: Math.random() * 0.5 + 0.1
            };
        }

        resize();
        for (let i = 0; i < 60; i++) particles.push(createParticle());
        window.addEventListener('resize', resize, { passive: true });

        function draw() {
            ctx.clearRect(0, 0, W, H);
            particles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(167, 139, 250, ${p.alpha})`;
                ctx.fill();
                p.x += p.dx;
                p.y += p.dy;
                if (p.y < -5 || p.x < -5 || p.x > W + 5) {
                    p.x = Math.random() * W;
                    p.y = H + 5;
                }
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    /* ─── Tilt effect on pricing cards (desktop) ─── */
    function initTilt() {
        if (window.matchMedia('(hover: none)').matches) return; // Skip on touch devices
        document.querySelectorAll('.pricing-card').forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                card.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    /* ─── Smooth scroll for anchor links ─── */
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                const id = a.getAttribute('href').slice(1);
                const target = document.getElementById(id);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    /* ─── Init ─── */
    document.addEventListener('DOMContentLoaded', () => {
        initHeroCarousel();
        initNavbar();
        initFaq();
        initScrollArrows();
        initScrollAnimations();
        loadMovies();
        initChannelCards();
        initParticles();
        initTilt();
        initCounters();
        initSmoothScroll();
    });

})();
