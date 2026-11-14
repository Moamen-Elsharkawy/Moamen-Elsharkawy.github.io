/* site.js - the whole motion layer. Four jobs, no dependencies, ~110 lines.
 *
 *   1. masthead rule + cadence dot   ONE rAF-throttled scroll listener, two consumers
 *   2. reveals, line-draws, counters ONE IntersectionObserver, unobserved after firing
 *   3. count-up                      animates TOWARD the value already in the DOM
 *   4. reduced-motion guard          short-circuits everything above
 *
 * THE COUNT-UP CONTRACT, and it is the most important thing in this file: the final value IS the
 * element's textContent in the HTML. JS reads it, animates from zero toward it, and writes it back
 * verbatim at the end. So JS-off renders the correct number, reduced-motion renders the correct
 * number, and a crashed script renders the correct number - with no second code path to keep in sync.
 * On a site whose entire argument is that its figures are true, the numbers must not depend on JS.
 *
 * NOTE: this motion layer has no precedent in this repo (the AI Spark School site has no
 * IntersectionObserver, no prefers-reduced-motion and no shared script at all). Screenshots cannot
 * catch a double-firing counter or a stuttering infinite loop, so the real-device pass in
 * README-deploy.md is a required step, not a nicety.
 */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- 1. scroll */
  var masthead = document.getElementById('masthead');
  var ledgerDot = document.getElementById('ledger-dot');
  var ledger = document.getElementById('cadence-ledger');
  var ticking = false;

  function onScroll() {
    if (masthead) masthead.classList.toggle('is-scrolled', window.scrollY > 24);

    // The cadence dot's Y maps to scroll progress through the #house ledger. transform only - never a
    // layout property. This is the site's only scroll-linked motion.
    if (ledgerDot && ledger && !reduce) {
      var r = ledger.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var p = (vh - r.top) / (vh + r.height);          // 0 entering, 1 leaving
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      ledgerDot.style.transform = 'translateY(' + (p * r.height).toFixed(1) + 'px)';
    }
    ticking = false;
  }
  function requestScroll() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }
  window.addEventListener('scroll', requestScroll, { passive: true });
  window.addEventListener('resize', requestScroll, { passive: true });
  onScroll();

  // Under reduced motion the dot parks at the halfway point instead of tracking scroll.
  if (reduce && ledgerDot && ledger) ledgerDot.style.transform = 'translateY(50%)';

  /* --------------------------------------------------------------- 3. count-up */
  function animateCount(el) {
    var finalText = el.textContent.trim();               // the source of truth, already correct
    var match = finalText.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!match) return;
    var target = parseFloat(match[0]);
    if (!isFinite(target)) return;

    var decimals = (match[0].split('.')[1] || '').length;
    var grouped = finalText.indexOf(',') !== -1;
    var prefix = finalText.slice(0, match.index);
    var suffix = finalText.slice(match.index + match[0].length);

    // Reserve the box BEFORE animating. tabular-nums equalises glyph advance, not string length:
    // counting to 12,866 renders "1", "12", "1,286", "12,866" - one to six characters - so without a
    // reserved width the element grows through the animation and reflows its caption.
    el.style.display = 'inline-block';
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    el.style.textAlign = el.style.textAlign || 'inherit';

    var start = null;
    var DUR = 900;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / DUR, 1);
      var eased = 1 - Math.pow(1 - t, 3);                // ease-out cubic
      if (t >= 1) { el.textContent = finalText; return; } // land on the exact original string
      var v = target * eased;
      var s = decimals ? v.toFixed(decimals)
                       : grouped ? Math.round(v).toLocaleString('en-US')
                                 : String(Math.round(v));
      el.textContent = prefix + s + suffix;
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------- 2. one observer for the rest */
  if (reduce || !('IntersectionObserver' in window)) {
    // Everything is already correct in the DOM; just make it visible and stop.
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      el.classList.add('is-in');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.draw'), function (el) {
      el.classList.add('is-drawn');
    });
    return;
  }

  // Stagger is one computed transition-delay per element, not a chain of setTimeouts.
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
    var sibs = el.parentNode ? el.parentNode.children : [el];
    var i = Array.prototype.indexOf.call(sibs, el);
    var step = el.closest('#work') || el.closest('#close') ? 80 : 60;
    el.style.transitionDelay = Math.min(i, 5) * step + 'ms';
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;

      if (el.classList.contains('reveal')) {
        el.classList.add('is-in');
        // Counters live inside a revealed block; fire them with it, once.
        Array.prototype.forEach.call(el.querySelectorAll('.count'), animateCount);
      }
      if (el.classList.contains('chain-wrap')) {
        var p = el.querySelector('.draw');
        if (p) p.classList.add('is-drawn');
        var svg = el.querySelector('.chain');
        if (svg) svg.classList.add('is-drawn');
      }
      io.unobserve(el);   // this is what makes double-firing structurally impossible
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  Array.prototype.forEach.call(document.querySelectorAll('.reveal, .chain-wrap'), function (el) {
    io.observe(el);
  });

  /* ------------------------------------- pause the hero packet when it is off-screen */
  // offset-distance is not a compositor-thread property in Chromium, so an unpaused infinite loop
  // keeps main-thread work scheduled forever and drains battery long after the hero has scrolled away.
  var packet = document.querySelector('.ng-packet');
  var graph = document.querySelector('.ng-wrap');
  if (packet && graph) {
    new IntersectionObserver(function (entries) {
      packet.classList.toggle('is-paused', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(graph);
  }
})();
