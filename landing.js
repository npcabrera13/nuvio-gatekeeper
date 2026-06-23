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
        { title: 'Project Hail Mary', imdbId: 'tt12042730' },
        { title: 'Michael', imdbId: 'tt11378946' },
        { title: 'Masters of the Universe', imdbId: 'tt0427340' },
        { title: 'Pressure', imdbId: 'tt32547691' },
        { title: 'The Death of Robin Hood', imdbId: 'tt32273171' }
    ];

    function initHeroCarousel() {
        const container = document.getElementById('heroBackdrops');
        const indicatorsWrap = document.getElementById('heroIndicators');
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
        heroMovies.forEach((_, i) => {
            const btn = document.createElement('button');
            btn.className = 'indicator' + (i === 0 ? ' active' : '');
            btn.setAttribute('aria-label', `Show ${heroMovies[i].title}`);
            btn.addEventListener('click', () => switchSlide(i));
            indicatorsWrap.appendChild(btn);
        });

        const indicators = indicatorsWrap.querySelectorAll('.indicator');
        let current = 0;

        function switchSlide(index) {
            slides[current].classList.remove('active');
            indicators[current].classList.remove('active');
            current = index;
            slides[current].classList.add('active');
            indicators[current].classList.add('active');
            // Re-trigger Ken Burns animation
            slides[current].style.animation = 'none';
            void slides[current].offsetWidth;
            slides[current].style.animation = '';
        }
    }

    /* ─── Fallback Movie List (if fetch fails) ─── */
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
            card.innerHTML = `
                <img src="${POSTER_BASE}/${encodeURIComponent(m.id)}/img" alt="${escapeHtml(m.name)}" loading="lazy">
                <span class="movie-rank">${i + 1}</span>
                <div class="movie-play">▶</div>
                <div class="movie-overlay">
                    <div class="movie-title">${escapeHtml(m.name)}</div>
                    <div class="movie-meta">${year}${rating ? ' · ' + rating : ''}</div>
                </div>
            `;
            row.appendChild(card);
        });
    }

    async function loadMovies() {
        // Try live fetch first
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
    }

    /* ─── FAQ Accordion ─── */
    function initFaq() {
        const items = document.querySelectorAll('.faq-item');
        items.forEach(item => {
            const btn = item.querySelector('.faq-question');
            if (!btn) return;
            btn.addEventListener('click', () => {
                const isOpen = item.classList.contains('open');
                // Close all
                items.forEach(other => {
                    other.classList.remove('open');
                    const otherBtn = other.querySelector('.faq-question');
                    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
                });
                // Open clicked (if it was closed)
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
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        elements.forEach(el => observer.observe(el));
    }

    /* ─── Init ─── */
    document.addEventListener('DOMContentLoaded', () => {
        initHeroCarousel();
        initNavbar();
        initFaq();
        initScrollArrows();
        initScrollAnimations();
        loadMovies();
    });

})();




// ===== HERO TRAILER CAROUSEL =====
const CATALOG_URL = 'https://nuviostreamapi.vercel.app/nuvio_2xa56et/catalog/movie/cinemeta___top.json';
const META_URL = 'https://v3-cinemeta.strem.io/meta/movie';
const BACKDROP_URL = 'https://images.metahub.space/background/medium';

let heroMovies = [];
let currentSlide = 0;
let trailerRotationTimer = null;

// Fallback movies if API fails
const FALLBACK_MOVIES = [
    { title: 'Project Hail Mary', imdbId: 'tt12042730', year: '2026', rating: '8.3' },
    { title: 'Michael', imdbId: 'tt11378946', year: '2026', rating: '7.7' },
    { title: 'Masters of the Universe', imdbId: 'tt0427340', year: '2026', rating: 'NR' },
    { title: 'Pressure', imdbId: 'tt32547691', year: '2026', rating: '7.7' },
    { title: 'The Death of Robin Hood', imdbId: 'tt32273171', year: '2026', rating: '7.4' }
];

async function initHeroCarousel() {
    const container = document.getElementById('trailerContainer');
    const fallback = document.getElementById('trailerFallback');
    const indicatorsWrap = document.getElementById('heroIndicators');
    
    if (!container) return;
    
    // Try to fetch real movies from Cinemeta
    try {
        const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(6000) });
        const data = await res.json();
        heroMovies = data.metas.slice(0, 5).map(m => ({
            title: m.name,
            imdbId: m.id,
            year: m.releaseInfo || '',
            rating: m.imdbRating || 'NR'
        }));
    } catch (err) {
        console.warn('[Nuvio] Cinemeta fetch failed, using fallback:', err.message);
        heroMovies = FALLBACK_MOVIES;
    }
    
    // Build indicators
    heroMovies.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.className = 'indicator' + (i === 0 ? ' active' : '');
        btn.setAttribute('aria-label', `Show ${heroMovies[i].title}`);
        btn.addEventListener('click', () => switchSlide(i));
        indicatorsWrap.appendChild(btn);
    });
    
    // Start with first movie
    switchSlide(0);
}

async function switchSlide(index) {
    const movie = heroMovies[index];
    if (!movie) return;
    
    currentSlide = index;
    
    // Update indicators
    document.querySelectorAll('.hero-indicators .indicator').forEach((ind, i) => {
        ind.classList.toggle('active', i === index);
    });
    
    // Update info
    document.getElementById('trailerTitle').textContent = movie.title;
    document.getElementById('trailerYear').textContent = movie.year;
    document.getElementById('trailerRating').textContent = movie.rating !== 'NR' ? `â˜… ${movie.rating}` : '';
    
    // Show backdrop immediately (fallback)
    const fallback = document.getElementById('trailerFallback');
    fallback.innerHTML = `<img src="${BACKDROP_URL}/${movie.imdbId}/img" alt="${movie.title}">`;
    
    // Try to fetch trailer
    try {
        const res = await fetch(`${META_URL}/${movie.imdbId}.json`);
        const data = await res.json();
        const trailerId = data.meta?.trailer;
        
        if (trailerId) {
            // Build YouTube embed URL (muted autoplay, loop)
            const embedUrl = `https://www.youtube.com/embed/${trailerId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerId}&modestbranding=1&showinfo=0&rel=0&playsinline=1`;
            
            // Inject iframe
            const container = document.getElementById('trailerContainer');
            const existingIframe = container.querySelector('iframe');
            if (existingIframe) {
                existingIframe.src = embedUrl;
            } else {
                const iframe = document.createElement('iframe');
                iframe.src = embedUrl;
                iframe.allow = 'autoplay; encrypted-media';
                iframe.allowFullscreen = true;
                iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
                container.insertBefore(iframe, container.firstChild);
            }
            
            // Hide fallback (trailer is playing)
            fallback.style.display = 'none';
        } else {
            // No trailer â€” show backdrop only
            const iframe = container.querySelector('iframe');
            if (iframe) iframe.remove();
            fallback.style.display = 'block';
        }
    } catch (err) {
        console.warn('[Nuvio] Trailer fetch failed:', err.message);
        // Show backdrop only
        fallback.style.display = 'block';
    }
    
    // Auto-rotate every 30 seconds
    if (trailerRotationTimer) clearTimeout(trailerRotationTimer);
    trailerRotationTimer = setTimeout(() => {
        const next = (currentSlide + 1) % heroMovies.length;
        switchSlide(next);
    }, 30000);
}

// Unmute button
document.getElementById('unmuteBtn')?.addEventListener('click', function() {
    const iframe = document.querySelector('#trailerContainer iframe');
    if (iframe) {
        // Post message to YouTube iframe to unmute
        iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
        this.style.display = 'none';
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initHeroCarousel);


// ===== NOW STREAMING â€” MOVIE ROW =====
const POSTER_URL = 'https://images.metahub.space/poster/medium';

async function loadTopMovies() {
    const row = document.getElementById('movieRow');
    if (!row) return;
    
    try {
        const res = await fetch(CATALOG_URL);
        const data = await res.json();
        const movies = data.metas.slice(0, 20);
        
        row.innerHTML = '';
        
        movies.forEach((movie, index) => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.innerHTML = `
                <img src="${POSTER_URL}/${movie.id}/img" alt="${movie.name}" loading="lazy">
                <div class="movie-card-rank">${index + 1}</div>
                <div class="movie-card-play">â–¶</div>
                <div class="movie-card-overlay">
                    <div class="movie-card-title">${movie.name}</div>
                    <div class="movie-card-meta">
                        <span>${movie.releaseInfo || ''}</span>
                        ${movie.imdbRating ? `<span class="rating">â˜… ${movie.imdbRating}</span>` : ''}
                    </div>
                </div>
            `;
            card.addEventListener('click', () => openMovieModal(movie));
            row.appendChild(card);
        });
    } catch (err) {
        row.innerHTML = '<div class="movie-loading">Failed to load movies. Please refresh.</div>';
    }
}

// ===== MOVIE MODAL =====
async function openMovieModal(movie) {
    const modal = document.getElementById('movieModal');
    const body = document.getElementById('modalBody');
    
    body.innerHTML = '<div style="text-align:center;padding:40px;">Loading...</div>';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    try {
        // Fetch full movie details
        const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${movie.id}.json`);
        const data = await res.json();
        const meta = data.meta || {};
        
        const trailerId = meta.trailer;
        const genres = (meta.genres || []).map(g => `<span class="modal-genre">${g}</span>`).join('');
        
        body.innerHTML = `
            ${trailerId ? `
                <div class="modal-trailer-container">
                    <iframe src="https://www.youtube.com/embed/${trailerId}?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                </div>
            ` : `
                <img src="${POSTER_URL}/${movie.id}/img" alt="${movie.name}" class="modal-poster">
            `}
            <div class="modal-title">${meta.name || movie.name}</div>
            <div class="modal-meta">
                <span>${meta.releaseInfo || movie.releaseInfo || ''}</span>
                ${meta.imdbRating ? `<span class="imdb">â˜… ${meta.imdbRating}</span>` : ''}
                ${meta.runtime ? `<span>${meta.runtime}</span>` : ''}
            </div>
            <div class="modal-genres">${genres}</div>
            <p class="modal-plot">${meta.description || 'No description available.'}</p>
            <a href="/signup" class="modal-cta">Watch on Nuvio â€” 7 Days Free â†’</a>
        `;
    } catch (err) {
        body.innerHTML = `
            <img src="${POSTER_URL}/${movie.id}/img" alt="${movie.name}" class="modal-poster">
            <div class="modal-title">${movie.name}</div>
            <p class="modal-plot">Failed to load details. Try again.</p>
            <a href="/signup" class="modal-cta">Watch on Nuvio â€” 7 Days Free â†’</a>
        `;
    }
}

// Close modal
document.getElementById('modalClose')?.addEventListener('click', closeModal);
document.getElementById('movieModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

function closeModal() {
    const modal = document.getElementById('movieModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    // Stop trailer
    const iframe = modal.querySelector('iframe');
    if (iframe) iframe.src = '';
}

// Scroll buttons
document.getElementById('scrollLeft')?.addEventListener('click', () => {
    document.getElementById('movieRow').scrollBy({ left: -400, behavior: 'smooth' });
});

document.getElementById('scrollRight')?.addEventListener('click', () => {
    document.getElementById('movieRow').scrollBy({ left: 400, behavior: 'smooth' });
});

// Load movies on page load
document.addEventListener('DOMContentLoaded', loadTopMovies);



// ===== APP MOCKUP — Load movie posters =====
async function loadMockupMovies() {
    const container = document.getElementById('mockupMovies');
    if (!container) return;
    
    try {
        const res = await fetch(CATALOG_URL);
        const data = await res.json();
        const movies = data.metas.slice(0, 6);
        
        container.innerHTML = movies.map(m => 
            `<img src="${POSTER_URL}/${m.id}/img" alt="${m.name}" loading="lazy">`
        ).join('');
    } catch (err) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#6b6b7e;font-size:0.8rem;">Movies preview</div>';
    }
}

document.addEventListener('DOMContentLoaded', loadMockupMovies);
