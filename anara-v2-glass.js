/* ============================================================
   Anara V2 Glass — Self-contained JS
   Motion budget: 3 named systems + utility (nav, FAQ native, form).
   ============================================================ */

(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------- 1. Mobile nav toggle -------- */
  function initNav() {
    var toggle = document.getElementById('navToggle');
    var links = document.getElementById('primaryNav');
    if (!toggle || !links) return;

    var setOpen = function (open) {
      links.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', function () {
      var isOpen = toggle.getAttribute('aria-expanded') === 'true';
      setOpen(!isOpen);
    });

    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* -------- 2. Sticky nav scrolled state -------- */
  function initNavScroll() {
    var nav = document.querySelector('.nav-wrap');
    if (!nav) return;
    var ticking = false;
    var update = function () {
      if (window.scrollY > 24) nav.setAttribute('data-scrolled', '');
      else nav.removeAttribute('data-scrolled');
      ticking = false;
    };
    var onScroll = function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* -------- 3. Hero stat count-up (motion #1) -------- */
  function initCountUp() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    var animate = function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var suffix = el.getAttribute('data-suffix') || '';
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var unitEl = el.querySelector('em, .unit');
      var unitHTML = unitEl ? unitEl.outerHTML : '';

      if (reduce) {
        el.innerHTML = target.toFixed(decimals) + suffix + unitHTML;
        return;
      }

      var dur = 1400;
      var start = performance.now();
      var tick = function (now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        var v = (target * eased).toFixed(decimals);
        el.innerHTML = v + suffix + unitHTML;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      counters.forEach(animate);
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          animate(en.target);
          obs.unobserve(en.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function (el) { obs.observe(el); });
  }

  /* -------- 3b. Hero photo parallax (subtle scroll-driven translateY) --------
     Disabled on mobile / touch / narrow viewports — the constant
     getBoundingClientRect() reads were the #1 scroll-jank source. */
  function initHeroParallax() {
    var photo = document.getElementById('heroPhoto');
    if (!photo || reduce) return;
    var mqTouch = window.matchMedia('(hover: none), (max-width: 880px)');
    if (mqTouch.matches) return;

    var ticking = false;
    var heroBottom = 0;
    var measure = function () {
      var rect = photo.getBoundingClientRect();
      heroBottom = rect.top + window.scrollY + rect.height;
    };
    var update = function () {
      // Cheap scroll-driven calc — no layout reads in the hot path.
      var y = window.scrollY;
      if (y > heroBottom) { ticking = false; return; }
      var progress = y / Math.max(1, heroBottom);
      var offset = (progress - 0.5) * 32;
      photo.style.setProperty('--parallax', offset.toFixed(1) + 'px');
      ticking = false;
    };
    var onScroll = function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    update();
  }

  /* -------- 4. Sample report bar reveal (motion #2) -------- */
  function initSampleReport() {
    var card = document.querySelector('.sample-card');
    if (!card) return;

    if (!('IntersectionObserver' in window)) {
      card.classList.add('is-revealed');
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-revealed');
          obs.unobserve(en.target);
        }
      });
    }, { threshold: 0.3 });
    obs.observe(card);
  }

  /* -------- 4b. Participation gap stage (compare section) -------- */
  function initGapStage() {
    var stage = document.getElementById('gapStage');
    if (!stage) return;

    var animateValue = function (el) {
      var target = parseFloat(el.getAttribute('data-target'));
      if (reduce) { el.textContent = target + '%'; return; }
      var dur = 1400;
      var start = performance.now();
      var tick = function (now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + '%';
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    var reveal = function () {
      stage.classList.add('is-revealed');
      stage.querySelectorAll('[data-target]').forEach(animateValue);
    };

    if (!('IntersectionObserver' in window)) { reveal(); return; }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          reveal();
          obs.unobserve(en.target);
        }
      });
    }, { threshold: 0.3 });
    obs.observe(stage);
  }

  /* -------- 5. Scroll progress hairline -------- */
  function initScrollProgress() {
    var bar = document.getElementById('scrollProgress');
    if (!bar || reduce) return;

    var ticking = false;
    var update = function () {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var prog = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0;
      bar.style.transform = 'scaleX(' + prog.toFixed(4) + ')';
      ticking = false;
    };

    var onScroll = function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* -------- 6. Reveal stagger on scroll-in -------- */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          obs.unobserve(en.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

    // Avoid first-paint flash: instantly reveal anything already in viewport.
    var vh = window.innerHeight;
    els.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < vh && rect.bottom > 0) {
        el.classList.add('is-in');
      } else {
        obs.observe(el);
      }
    });
  }

  /* -------- 7. Logo marquee — duplicate items for seamless loop -------- */
  function initLogoMarquee() {
    var track = document.getElementById('logosTrack');
    if (!track) return;
    if (reduce) return;

    var viewport = track.parentElement;
    var originals = Array.prototype.slice.call(track.children);
    if (!originals.length) return;

    // Pad until single set is wide enough to span viewport at least once
    var viewportWidth = viewport.offsetWidth || window.innerWidth;
    var safety = 0;
    while (track.scrollWidth < viewportWidth * 1.5 && safety < 30) {
      originals.forEach(function (item) {
        var clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });
      safety++;
    }

    // Clone full current set once more so translateX(-50%) wraps seamlessly
    var current = Array.prototype.slice.call(track.children);
    current.forEach(function (item) {
      var clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
  }

  /* -------- 8. FAQ smooth height -------- */
  function initFaqSmooth() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    items.forEach(function (item) {
      var summary = item.querySelector('summary');
      var body = item.querySelector('.faq-body');
      if (!summary || !body) return;

      summary.addEventListener('click', function (e) {
        if (reduce) return; // native toggle
        e.preventDefault();
        if (item.classList.contains('is-animating')) return;
        item.classList.add('is-animating');

        var onEnd = function (ev) {
          if (ev.propertyName !== 'height') return;
          body.removeEventListener('transitionend', onEnd);
          body.style.height = '';
          item.classList.remove('is-animating');
        };

        if (item.open) {
          // Close
          var startH = body.scrollHeight;
          body.style.height = startH + 'px';
          /* Force reflow */ void body.offsetHeight;
          body.style.height = '0px';
          var onCloseEnd = function (ev) {
            if (ev.propertyName !== 'height') return;
            body.removeEventListener('transitionend', onCloseEnd);
            item.open = false;
            body.style.height = '';
            item.classList.remove('is-animating');
          };
          body.addEventListener('transitionend', onCloseEnd);
        } else {
          // Open
          item.open = true;
          var targetH = body.scrollHeight;
          body.style.height = '0px';
          /* Force reflow */ void body.offsetHeight;
          body.style.height = targetH + 'px';
          body.addEventListener('transitionend', onEnd);
        }
      });
    });
  }

  /* -------- 8a. Scroll-spy nav (highlight in-view section) -------- */
  function initScrollSpy() {
    var links = document.querySelectorAll('.nav-links a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    var sections = [];
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = id ? document.getElementById(id) : null;
      if (sec) {
        map[id] = a;
        sections.push(sec);
      }
    });
    if (!sections.length) return;

    var state = {};
    var apply = function () {
      var bestId = null, bestTop = Infinity;
      Object.keys(state).forEach(function (id) {
        var s = state[id];
        if (s && s.intersecting && s.top < bestTop) {
          bestTop = s.top; bestId = id;
        }
      });
      links.forEach(function (l) { l.classList.remove('is-active'); });
      if (bestId && map[bestId]) map[bestId].classList.add('is-active');
    };

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        state[en.target.id] = {
          intersecting: en.isIntersecting,
          top: en.boundingClientRect.top
        };
      });
      apply();
    }, { rootMargin: '-25% 0px -55% 0px', threshold: 0 });

    sections.forEach(function (sec) { obs.observe(sec); });
  }

  /* -------- 8b. FAQ category filter -------- */
  function initFaqFilter() {
    var chips = document.querySelectorAll('.faq-chip');
    var items = document.querySelectorAll('.faq-item[data-cat]');
    if (!chips.length || !items.length) return;

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var filter = chip.getAttribute('data-filter');
        chips.forEach(function (c) {
          c.classList.toggle('is-active', c === chip);
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        items.forEach(function (item) {
          var match = filter === 'all' || item.getAttribute('data-cat') === filter;
          item.hidden = !match;
          if (!match && item.open) item.open = false;
        });
      });
    });
  }

  /* -------- 9. Lead form (validation + Formspree submit + inline success) -------- */
  function initLeadForm() {
    var form = document.getElementById('leadForm');
    if (!form) return;

    var successEl = form.parentElement.querySelector('.form-success');
    var submitBtn = form.querySelector('button[type="submit"]');

    // Float-label fill state for select (placeholder-shown trick can't see selects)
    var selectRows = form.querySelectorAll('.form-float--select');
    var syncSelectFill = function (row) {
      var sel = row.querySelector('select');
      if (!sel) return;
      row.classList.toggle('is-filled', !!sel.value);
    };
    selectRows.forEach(function (row) {
      syncSelectFill(row);
      var sel = row.querySelector('select');
      if (sel) sel.addEventListener('change', function () { syncSelectFill(row); });
    });

    var clearError = function (row) {
      row.classList.remove('has-error');
      var input = row.querySelector('input, select, textarea');
      if (input) input.removeAttribute('aria-invalid');
      var errorEl = row.querySelector('.form-error');
      if (errorEl) errorEl.textContent = '';
    };

    var setError = function (row, message) {
      row.classList.add('has-error');
      var input = row.querySelector('input, select, textarea');
      if (input) input.setAttribute('aria-invalid', 'true');
      var errorEl = row.querySelector('.form-error');
      if (errorEl && message) errorEl.textContent = message;
    };

    // Clear errors as the user types/changes
    form.querySelectorAll('input, select, textarea').forEach(function (input) {
      input.addEventListener('input', function () {
        var row = input.closest('.form-row');
        if (row) clearError(row);
      });
      input.addEventListener('change', function () {
        var row = input.closest('.form-row');
        if (row) clearError(row);
      });
    });

    var validate = function () {
      var valid = true;
      form.querySelectorAll('.form-row').forEach(function (row) { clearError(row); });

      form.querySelectorAll('[required]').forEach(function (input) {
        var row = input.closest('.form-row');
        var value = (input.value || '').trim();
        if (!value) {
          setError(row, 'Required');
          valid = false;
          return;
        }
        if (input.type === 'email') {
          var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(value)) {
            setError(row, 'Enter a valid work email');
            valid = false;
          }
        }
      });

      return valid;
    };

    var announcer = document.getElementById('formAnnouncer');
    var announce = function (msg) {
      if (!announcer) return;
      announcer.textContent = '';
      // Defer to next tick so SR re-reads
      setTimeout(function () { announcer.textContent = msg; }, 60);
    };

    var showFormError = function (msg) {
      announce(msg);
      var existing = form.querySelector('.form-submit-error');
      if (!existing) {
        existing = document.createElement('p');
        existing.className = 'form-submit-error';
        existing.setAttribute('role', 'alert');
        var actions = form.querySelector('.form-actions');
        if (actions) actions.appendChild(existing);
      }
      existing.textContent = msg;
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) {
        announce('There are errors in the form. Please review the highlighted fields.');
        var firstError = form.querySelector('.has-error input, .has-error select, .has-error textarea');
        if (firstError) firstError.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('data-state', 'sending');
      }
      announce('Submitting your request.');

      var data = new FormData(form);
      var endpoint = form.getAttribute('action');
      var isPlaceholder = !endpoint || endpoint.indexOf('REPLACE_WITH_YOUR_ID') !== -1;

      var showSuccess = function () {
        if (submitBtn) submitBtn.setAttribute('data-state', 'done');
        setTimeout(function () {
          form.style.display = 'none';
          if (successEl) {
            successEl.classList.add('is-visible');
            successEl.setAttribute('tabindex', '-1');
            successEl.focus();
          }
          announce('Request received. Our team will reach out within 48 hours.');
        }, 700);
      };

      if (isPlaceholder) {
        // Backend not wired yet — flag in console for engineers, still show success state for QA.
        if (window.console && console.warn) console.warn('Form action is a placeholder; submissions are not delivered.');
        setTimeout(showSuccess, 900);
        return;
      }

      var ctrl = new AbortController();
      var timeout = setTimeout(function () { ctrl.abort(); }, 10000);

      fetch(endpoint, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' },
        signal: ctrl.signal
      })
        .then(function (res) {
          clearTimeout(timeout);
          if (res.ok) {
            showSuccess();
          } else {
            throw new Error('Submission failed');
          }
        })
        .catch(function () {
          clearTimeout(timeout);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.removeAttribute('data-state');
          }
          showFormError('We could not submit your request. Please email sales@anara.health directly.');
        });
    });
  }

  /* -------- Boot -------- */
  function boot() {
    initNav();
    initNavScroll();
    initScrollProgress();
    initHeroParallax();
    initReveal();
    initLogoMarquee();
    initScrollSpy();
    initFaqSmooth();
    initFaqFilter();
    initCountUp();
    initSampleReport();
    initGapStage();
    initLeadForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
