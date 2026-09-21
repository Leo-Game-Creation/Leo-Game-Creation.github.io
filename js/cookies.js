/**
 * Gestion du consentement cookies / RGPD — Leo Game Studio (leogamecreation.fr)
 *
 * API publique : window.LeoCookies
 *
 * Charger un script analytics UNIQUEMENT après consentement :
 *
 *   LeoCookies.runWhenAllowed('analytics', function () {
 *     // Exemple — remplacer G-XXXXXXXX par un identifiant réel avant activation :
 *     // var s = document.createElement('script');
 *     // s.async = true;
 *     // s.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX';
 *     // document.head.appendChild(s);
 *   });
 *
 * Ou déclarer un script inerte dans le HTML :
 *   <script type="text/plain" data-cookie-consent="analytics" src="..."></script>
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'lgc_cookie_consent';
    var COOKIE_NAME = 'lgc_consent';
    var VERSION = 1;
    var CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 183; // ~6 mois (recommandation CNIL)

    var CATEGORIES = ['analytics', 'marketing'];

    var consent = null;
    var listeners = { analytics: [], marketing: [] };
    var lastFocus = null;
    var els = {};

    function nowIso() {
        return new Date().toISOString();
    }

    function isExpired(record) {
        if (!record || !record.timestamp) return true;
        var ts = Date.parse(record.timestamp);
        if (isNaN(ts)) return true;
        return (Date.now() - ts) / 1000 > CONSENT_MAX_AGE_SECONDS;
    }

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.version !== VERSION) return null;
        if (isExpired(raw)) return null;
        return {
            version: VERSION,
            necessary: true,
            analytics: !!raw.analytics,
            marketing: !!raw.marketing,
            timestamp: raw.timestamp || nowIso()
        };
    }

    function readCookie(name) {
        var parts = ('; ' + document.cookie).split('; ' + name + '=');
        if (parts.length < 2) return '';
        return decodeURIComponent(parts.pop().split(';').shift() || '');
    }

    function writeCookie(name, value, maxAge) {
        document.cookie = name + '=' + encodeURIComponent(value) +
            '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax';
    }

    function loadStored() {
        try {
            var fromStorage = localStorage.getItem(STORAGE_KEY);
            if (fromStorage) {
                var parsed = normalize(JSON.parse(fromStorage));
                if (parsed) return parsed;
            }
        } catch (e) { /* private mode / blocked storage */ }

        var cookieVal = readCookie(COOKIE_NAME);
        if (!cookieVal) return null;
        try {
            return normalize(JSON.parse(cookieVal));
        } catch (e2) {
            return null;
        }
    }

    function persist(record) {
        consent = record;
        var payload = JSON.stringify(record);
        try {
            localStorage.setItem(STORAGE_KEY, payload);
        } catch (e) { /* ignore */ }
        writeCookie(COOKIE_NAME, payload, CONSENT_MAX_AGE_SECONDS);
    }

    function getScriptBase() {
        var script = document.currentScript || document.querySelector('script[src*="cookies.js"]');
        if (!script || !script.getAttribute('src')) return { root: '', css: 'css/cookies.css' };
        var src = script.getAttribute('src');
        var root = src.indexOf('../') === 0 ? '../' : '';
        var cssHref = src.replace(/js\/cookies\.js(\?.*)?$/, 'css/cookies.css');
        return { root: root, css: cssHref };
    }

    var paths = getScriptBase();

    function ensureCss() {
        if (document.querySelector('link[href*="cookies.css"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = paths.css;
        document.head.appendChild(link);
    }

    function privacyUrl() {
        return paths.root + 'confidentialite.html#cookies-site';
    }

    function hasConsent(category) {
        if (category === 'necessary') return true;
        return !!(consent && consent[category]);
    }

    function emitAllowed() {
        CATEGORIES.forEach(function (category) {
            if (!hasConsent(category)) return;
            activateDeclaredScripts(category);
            var queue = listeners[category].slice();
            listeners[category] = [];
            queue.forEach(function (fn) {
                try { fn(); } catch (err) { console.error(err); }
            });
        });
    }

    function activateDeclaredScripts(category) {
        var nodes = document.querySelectorAll('script[type="text/plain"][data-cookie-consent="' + category + '"]');
        nodes.forEach(function (node) {
            if (node.getAttribute('data-cookie-loaded') === '1') return;
            node.setAttribute('data-cookie-loaded', '1');
            var live = document.createElement('script');
            Array.prototype.forEach.call(node.attributes, function (attr) {
                if (attr.name === 'type' || attr.name === 'data-cookie-consent' || attr.name === 'data-cookie-loaded') return;
                live.setAttribute(attr.name, attr.value);
            });
            if (node.textContent) live.textContent = node.textContent;
            node.parentNode.insertBefore(live, node.nextSibling);
        });
    }

    function saveChoice(analytics, marketing) {
        persist({
            version: VERSION,
            necessary: true,
            analytics: !!analytics,
            marketing: !!marketing,
            timestamp: nowIso()
        });
        hideBanner();
        closePreferences();
        emitAllowed();
    }

    function acceptAll() {
        saveChoice(true, true);
    }

    function refuseNonEssential() {
        saveChoice(false, false);
    }

    function runWhenAllowed(category, callback) {
        if (typeof callback !== 'function') return;
        if (hasConsent(category)) {
            callback();
            return;
        }
        if (listeners[category]) listeners[category].push(callback);
    }

    function trapFocus(event) {
        if (event.key !== 'Tab' || !els.modal || els.modal.hidden) return;
        var focusable = els.modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function onKeydown(event) {
        if (event.key === 'Escape' && els.modal && !els.modal.hidden) {
            event.preventDefault();
            closePreferences();
            return;
        }
        trapFocus(event);
    }

    function showBanner() {
        if (!els.banner) return;
        els.banner.hidden = false;
        document.documentElement.classList.add('lgc-cookie-banner-visible');
        document.body.classList.add('lgc-cookie-banner-visible');
    }

    function hideBanner() {
        if (!els.banner) return;
        els.banner.hidden = true;
        document.documentElement.classList.remove('lgc-cookie-banner-visible');
        document.body.classList.remove('lgc-cookie-banner-visible');
    }

    function syncToggles() {
        if (!els.analytics || !els.marketing) return;
        var current = consent || { analytics: false, marketing: false };
        els.analytics.checked = !!current.analytics;
        els.marketing.checked = !!current.marketing;
    }

    function openPreferences(event) {
        if (event) event.preventDefault();
        if (!els.modal) return;
        lastFocus = document.activeElement;
        syncToggles();
        els.overlay.hidden = false;
        els.modal.hidden = false;
        els.modal.focus();
        document.addEventListener('keydown', onKeydown);
    }

    function closePreferences() {
        if (!els.modal) return;
        els.overlay.hidden = true;
        els.modal.hidden = true;
        document.removeEventListener('keydown', onKeydown);
        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
    }

    function saveFromPanel() {
        saveChoice(els.analytics.checked, els.marketing.checked);
    }

    function buildUi() {
        if (document.getElementById('lgc-cookie-banner')) return;

        var banner = document.createElement('div');
        banner.id = 'lgc-cookie-banner';
        banner.className = 'lgc-cookie-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-modal', 'false');
        banner.setAttribute('aria-labelledby', 'lgc-cookie-title');
        banner.setAttribute('aria-describedby', 'lgc-cookie-text');
        banner.hidden = true;
        banner.innerHTML =
            '<div class="lgc-cookie-banner__inner">' +
                '<div>' +
                    '<p class="lgc-cookie-banner__title" id="lgc-cookie-title">Cookies et confidentialité</p>' +
                    '<p class="lgc-cookie-banner__text" id="lgc-cookie-text">' +
                        'Leo Game Studio utilise un cookie essentiel pour mémoriser vos choix. ' +
                        'Les cookies optionnels (mesure d’audience, marketing) ne sont déposés qu’avec votre accord. ' +
                        '<a href="' + privacyUrl() + '">Politique de confidentialité</a>.' +
                    '</p>' +
                '</div>' +
                '<div class="lgc-cookie-actions">' +
                    '<button type="button" class="lgc-cookie-btn lgc-cookie-btn--accept" data-lgc-action="accept">Tout accepter</button>' +
                    '<button type="button" class="lgc-cookie-btn lgc-cookie-btn--refuse" data-lgc-action="refuse">Tout refuser</button>' +
                    '<button type="button" class="lgc-cookie-btn lgc-cookie-btn--ghost" data-lgc-action="customize">Personnaliser</button>' +
                '</div>' +
            '</div>';

        var overlay = document.createElement('div');
        overlay.className = 'lgc-cookie-overlay';
        overlay.hidden = true;
        overlay.setAttribute('data-lgc-action', 'close-overlay');

        var modal = document.createElement('div');
        modal.id = 'gestion-cookies';
        modal.className = 'lgc-cookie-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'lgc-cookie-modal-title');
        modal.tabIndex = -1;
        modal.hidden = true;
        modal.innerHTML =
            '<button type="button" class="lgc-cookie-close" data-lgc-action="close" aria-label="Fermer">×</button>' +
            '<h2 class="lgc-cookie-modal__title" id="lgc-cookie-modal-title">Vos préférences cookies</h2>' +
            '<p class="lgc-cookie-modal__intro">Les cookies essentiels sont nécessaires au fonctionnement du site. Les autres catégories restent désactivées tant que vous ne les acceptez pas.</p>' +
            '<div class="lgc-cookie-choice">' +
                '<p class="lgc-cookie-choice__label" id="lgc-necessary-label">Cookies essentiels</p>' +
                '<label class="lgc-cookie-switch">' +
                    '<input type="checkbox" checked disabled aria-labelledby="lgc-necessary-label">' +
                    '<span class="lgc-cookie-switch__ui" aria-hidden="true"></span>' +
                '</label>' +
                '<p class="lgc-cookie-choice__desc">Mémorisation de vos choix de consentement. Toujours actifs, ils ne nécessitent pas de consentement.</p>' +
            '</div>' +
            '<div class="lgc-cookie-choice">' +
                '<p class="lgc-cookie-choice__label" id="lgc-analytics-label">Mesure d’audience</p>' +
                '<label class="lgc-cookie-switch">' +
                    '<input type="checkbox" id="lgc-consent-analytics" aria-labelledby="lgc-analytics-label">' +
                    '<span class="lgc-cookie-switch__ui" aria-hidden="true"></span>' +
                '</label>' +
                '<p class="lgc-cookie-choice__desc">Statistiques de fréquentation (ex. Google Analytics), uniquement si un outil est configuré plus tard. Aucun traceur n’est chargé sans votre accord.</p>' +
            '</div>' +
            '<div class="lgc-cookie-choice">' +
                '<p class="lgc-cookie-choice__label" id="lgc-marketing-label">Marketing / publicité</p>' +
                '<label class="lgc-cookie-switch">' +
                    '<input type="checkbox" id="lgc-consent-marketing" aria-labelledby="lgc-marketing-label">' +
                    '<span class="lgc-cookie-switch__ui" aria-hidden="true"></span>' +
                '</label>' +
                '<p class="lgc-cookie-choice__desc">Publicités ou pixels partenaires sur le site. Aucun cookie marketing n’est déposé aujourd’hui sans activation explicite.</p>' +
            '</div>' +
            '<div class="lgc-cookie-modal__actions">' +
                '<button type="button" class="lgc-cookie-btn lgc-cookie-btn--accept" data-lgc-action="save">Enregistrer mes choix</button>' +
                '<button type="button" class="lgc-cookie-btn lgc-cookie-btn--refuse" data-lgc-action="refuse">Tout refuser</button>' +
                '<button type="button" class="lgc-cookie-btn lgc-cookie-btn--ghost" data-lgc-action="accept">Tout accepter</button>' +
            '</div>';

        document.body.appendChild(overlay);
        document.body.appendChild(modal);
        document.body.appendChild(banner);

        els.banner = banner;
        els.overlay = overlay;
        els.modal = modal;
        els.analytics = document.getElementById('lgc-consent-analytics');
        els.marketing = document.getElementById('lgc-consent-marketing');

        document.body.addEventListener('click', function (event) {
            var actionEl = event.target.closest('[data-lgc-action]');
            if (actionEl) {
                var action = actionEl.getAttribute('data-lgc-action');
                if (action === 'accept') acceptAll();
                else if (action === 'refuse') refuseNonEssential();
                else if (action === 'customize') openPreferences(event);
                else if (action === 'save') saveFromPanel();
                else if (action === 'close' || action === 'close-overlay') closePreferences();
            }

            var reopen = event.target.closest('.js-open-cookie-settings, a[href="#cookies"], a[href="#gestion-cookies"]');
            if (reopen) openPreferences(event);
        });
    }

    function init() {
        ensureCss();
        buildUi();
        consent = loadStored();
        if (!consent) {
            showBanner();
        } else {
            emitAllowed();
        }
    }

    window.LeoCookies = {
        getConsent: function () {
            return consent ? {
                necessary: true,
                analytics: !!consent.analytics,
                marketing: !!consent.marketing,
                timestamp: consent.timestamp
            } : null;
        },
        hasConsent: hasConsent,
        runWhenAllowed: runWhenAllowed,
        onConsent: runWhenAllowed,
        openPreferences: openPreferences,
        acceptAll: acceptAll,
        refuseNonEssential: refuseNonEssential
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
