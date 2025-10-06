/* FlipCard library: reusable, configurable card flip component */
(function (global) {
  'use strict';

  const DEFAULTS = {
    faceSrc: 'assets/img/cards/0.png',
    backSrc: 'assets/img/cards/r.png',
    faceBg: '#000000',        // background color when face is shown
    backBg: '#000000',        // background color when back is shown
    startFaceUp: false,
    highlight: false,
    duration: 700,            // ms, full flip
    dwellAtRibMs: 140,        // ms to linger at rib (0 for none)
    postFlipPauseMs: 0,       // ms cooldown after flip completes
    proportion: null,         // e.g. '2 / 3', [w,h], or number ratio (w/h)
    mirrorBack: true,         // keep back image non-mirrored
    reducedMotion: null,      // override, or null to auto-detect
    // Callbacks
    onFlipStart: null,        // (direction: 'to-face'|'to-reverse', api)
    onRib: null,              // (direction, api)
    onFlipEnd: null,          // (finalState: 'face'|'reverse', api)
    onFace: null,             // (api)
    onReverse: null,          // (api)
    onHighlightChange: null   // (enabled: boolean, api)
  };

  class FlipCard {
    constructor(root, options = {}) {
      this.root = typeof root === 'string' ? document.querySelector(root) : root;
      if (!this.root) throw new Error('FlipCard: root element not found');
      this.options = { ...DEFAULTS, ...options };
      this.prefersReduced = this.options.reducedMotion != null
        ? !!this.options.reducedMotion
        : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      // Ensure structure
      this.root.classList.add('card');
      this.inner = this._ensureChild('.card__inner', () => {
        const el = document.createElement('div');
        el.className = 'card__inner';
        this.root.appendChild(el);
        return el;
      });
      this._ensureEdges();
      this.plane = this._ensureChild('.card__plane', () => {
        const el = document.createElement('div');
        el.className = 'card__plane';
        this.inner.appendChild(el);
        return el;
      });

      // State
      this.isFace = !!this.options.startFaceUp;
      this.isFlipping = false;
      this.flipDirection = null; // 'to-face' | 'to-reverse'
      this.availableAt = 0; // cooldown timestamp

      // Apply initial classes and attributes
      this.root.setAttribute('type', this.root.tagName.toLowerCase() === 'button' ? 'button' : 'button');
      this.root.setAttribute('aria-label', this.root.getAttribute('aria-label') || 'Playing card: click to flip');
      this.root.setAttribute('aria-pressed', this.isFace ? 'true' : 'false');
      if (!this.isFace) this.root.classList.add('is-reverse');
      else this.root.classList.remove('is-reverse');

      // Apply images
      this._preload(this.options.faceSrc);
      this._preload(this.options.backSrc);
      this.plane.style.backgroundImage = `url('${this.isFace ? this.options.faceSrc : this.options.backSrc}')`;
      this._applyCurrentBackgroundColor();

      // Styling per instance
      this.setDuration(this.options.duration);
      if (this.options.proportion) this.setProportion(this.options.proportion);
      else this._setAspectFromReverse();

      if (this.options.mirrorBack) {
        // already handled via CSS (.card.is-reverse .card__plane { scaleX(-1) })
      }

      // Highlight
      if (this.options.highlight) this._setHighlight(true);
      else this._setHighlight(false);

      // Bind
      this._onClick = () => { if (!this.isFlipping) this.toggle(); };
      this.root.addEventListener('click', this._onClick);

      this._onTransitionEnd = (ev) => this._handleTransitionEnd(ev);
      this.inner.addEventListener('transitionend', this._onTransitionEnd);
    }

    // ---------- Public API ----------
    flipToFace() {
      if (this._blocked()) return;
      if (this.isFace) return;
      this._emit('onFlipStart', 'to-face');
      this.isFlipping = true;
      this.flipDirection = 'to-face';
      this.root.classList.add('is-flipping');
      this._setHighlight(true);
      this.root.setAttribute('aria-pressed', 'true');

      if (this.prefersReduced) {
        this.isFace = true;
        this.plane.style.backgroundImage = `url('${this.options.faceSrc}')`;
        this._applyFaceBackground();
        this.root.classList.remove('is-reverse', 'to-rib', 'is-flipping');
        this.isFlipping = false;
        this._finish('face');
        return;
      }

      // Phase 1 → rib
      this.root.classList.add('to-rib');
    }

    flipToReverse() {
      if (this._blocked()) return;
      if (!this.isFace) return;
      this._emit('onFlipStart', 'to-reverse');
      this.isFlipping = true;
      this.flipDirection = 'to-reverse';
      this.root.classList.add('is-flipping');
      this.root.setAttribute('aria-pressed', 'false');

      if (this.prefersReduced) {
        this.isFace = false;
        this.plane.style.backgroundImage = `url('${this.options.backSrc}')`;
        this._applyBackBackground();
        this.root.classList.add('is-reverse');
        this.root.classList.remove('to-rib', 'is-flipping');
        this.isFlipping = false;
        this._setHighlight(false);
        this._finish('reverse');
        return;
      }

      // Phase 1 → rib
      this.root.classList.add('to-rib');
    }

    toggle() { this.isFace ? this.flipToReverse() : this.flipToFace(); }

    setDuration(ms) {
      const v = Math.max(0, Number(ms) || 0);
      this.root.style.setProperty('--duration', `${v}ms`);
      this.options.duration = v;
      return this;
    }

    setProportion(prop) {
      const css = this._asAspect(prop);
      if (css) this.root.style.setProperty('--card-aspect', css);
      this.options.proportion = prop;
      return this;
    }

    setRibDwell(ms) { this.options.dwellAtRibMs = Math.max(0, Number(ms) || 0); return this; }
    setPostFlipPause(ms) { this.options.postFlipPauseMs = Math.max(0, Number(ms) || 0); return this; }

    showHighlight() { this._setHighlight(true); return this; }
    hideHighlight() { this._setHighlight(false); return this; }
    setHighlight(enabled) { this._setHighlight(!!enabled); return this; }

    on(eventName, fn) { this.options[eventName] = fn; return this; }

    destroy() {
      this.root.removeEventListener('click', this._onClick);
      this.inner.removeEventListener('transitionend', this._onTransitionEnd);
    }

    // ---------- Internals ----------
    _blocked() { return this.isFlipping || Date.now() < this.availableAt; }

    _ensureChild(selector, create) {
      return this.root.querySelector(selector) || create();
    }

    _ensureEdges() {
      const ensure = (cls) => {
        if (!this.inner.querySelector(`.${cls}`)) {
          const el = document.createElement('div');
          el.className = `card__edge ${cls}`;
          this.inner.appendChild(el);
        }
      };
      ensure('card__edge--left');
      ensure('card__edge--right');
      ensure('card__edge--top');
      ensure('card__edge--bottom');
    }

    _setHighlight(enabled) {
      const had = this.root.classList.contains('card--highlight');
      if (enabled) this.root.classList.add('card--highlight');
      else this.root.classList.remove('card--highlight');
      if (had !== enabled && typeof this.options.onHighlightChange === 'function') {
        this.options.onHighlightChange(enabled, this);
      }
    }

    _handleTransitionEnd(ev) {
      if (ev.propertyName !== 'transform') return;
      if (!this.isFlipping) return;

      if (this.root.classList.contains('to-rib')) {
        // At rib: show constant-thickness highlight and 3D edges
        if (this.root.classList.contains('card--highlight')) this.root.classList.add('at-rib');
        if (typeof this.options.onRib === 'function') this.options.onRib(this.flipDirection, this);

        // Swap image at rib
        if (this.flipDirection === 'to-face') {
          this.plane.style.backgroundImage = `url('${this.options.faceSrc}')`;
          this._applyFaceBackground();
        } else if (this.flipDirection === 'to-reverse') {
          this.plane.style.backgroundImage = `url('${this.options.backSrc}')`;
          this._applyBackBackground();
        }

        const dwell = this.prefersReduced ? 0 : (this.options.dwellAtRibMs || 0);
        window.setTimeout(() => {
          if (this.flipDirection === 'to-face') {
            this.root.classList.remove('is-reverse'); // proceed 90 -> 0
          } else if (this.flipDirection === 'to-reverse') {
            this.root.classList.add('is-reverse'); // proceed 90 -> 180
          }
          this.root.classList.remove('to-rib');
          requestAnimationFrame(() => this.root.classList.remove('at-rib'));
        }, dwell);
        return; // wait for second half end
      }

      // Completed second half
      this.isFlipping = false;
      this.root.classList.remove('is-flipping');
      if (this.flipDirection === 'to-face') {
        this.isFace = true;
        if (typeof this.options.onFace === 'function') this.options.onFace(this);
        this._finish('face');
      } else if (this.flipDirection === 'to-reverse') {
        this.isFace = false;
        this._setHighlight(false); // auto-hide on close
        if (typeof this.options.onReverse === 'function') this.options.onReverse(this);
        this._finish('reverse');
      }
      this.flipDirection = null;
    }

    _finish(finalState) {
      if (typeof this.options.onFlipEnd === 'function') this.options.onFlipEnd(finalState, this);
      const pause = Math.max(0, this.options.postFlipPauseMs || 0);
      this.availableAt = Date.now() + pause;
    }

    _asAspect(prop) {
      if (!prop) return null;
      if (Array.isArray(prop) && prop.length === 2) {
        const [w, h] = prop; return `${w} / ${h}`;
      }
      if (typeof prop === 'number' && isFinite(prop) && prop > 0) {
        // prop treated as width/height ratio
        return `${prop} / 1`;
      }
      if (typeof prop === 'string') return prop;
      return null;
    }

    _setAspectFromReverse() {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w > 0 && h > 0) this.root.style.setProperty('--card-aspect', `${w} / ${h}`);
      };
      img.src = this.options.backSrc;
    }

    _preload(src) { const i = new Image(); i.src = src; }

    _emit(name, ...args) { const fn = this.options[name]; if (typeof fn === 'function') fn(...args, this); }

    // ---------- Background helpers ----------
    _applyFaceBackground() {
      this.plane.style.backgroundColor = this.options.faceBg || '';
    }
    _applyBackBackground() {
      this.plane.style.backgroundColor = this.options.backBg || '';
    }
    _applyCurrentBackgroundColor() {
      if (this.isFace) this._applyFaceBackground(); else this._applyBackBackground();
    }

    // ---------- Public background API ----------
    setFaceBackground(color) {
      this.options.faceBg = color;
      if (this.isFace) this._applyFaceBackground();
      return this;
    }

    setBackBackground(color) {
      this.options.backBg = color;
      if (!this.isFace) this._applyBackBackground();
      return this;
    }
  }

  // Expose as global
  global.FlipCard = FlipCard;
})(window);
