/*
 * Search & filter for the qgis2web map.
 *
 * Type a name (e.g. "Dajin") and the map only shows the features whose
 * manufacturer / facility / port / project name / country contains that text.
 * Every data layer is picked up automatically (any global "layer_..." that is
 * a GeoJSON layer), so this file keeps working after a fresh qgis2web export:
 * just add the <link> for css/search.css and the <script> for js/search.js
 * again, right before </body>.
 */
(function () {
    'use strict';

    // Fields that are searched, in every layer that has them.
    var SEARCH_FIELDS = [
        'Manufacture', 'Facility', 'Fascility',
        'Port', 'Port Terminal', 'Port authority',
        'Project Name', 'Partnership', 'Country'
    ];
    // Field used as the title of a result (first one present wins).
    var TITLE_FIELDS = ['Manufacture', 'Port', 'Project Name'];
    // Field used as the subtitle of a result.
    var SUBTITLE_FIELDS = ['Facility', 'Fascility', 'Port Terminal', 'Project Status'];

    var MAX_LISTED = 100;      // results shown in the dropdown
    var AUTO_ZOOM_DELAY = 700; // ms after typing stops before zooming to matches

    if (typeof map === 'undefined' || typeof L === 'undefined') { return; }

    // ---------- Blue Power Partners logo (bottom-left) ----------
    var LogoControl = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function () {
            var c = L.DomUtil.create('div', 'bpp-logo');
            c.innerHTML = '<img src="images/bpp-logo-white.svg" alt="Blue Power Partners">';
            L.DomEvent.disableClickPropagation(c);
            return c;
        }
    });
    new LogoControl().addTo(map);

    // ---------- helpers ----------
    function normalize(s) {
        return String(s == null ? '' : s)
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
            .toLowerCase();
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function firstField(props, fields) {
        for (var i = 0; i < fields.length; i++) {
            var v = props[fields[i]];
            if (v != null && String(v).trim() !== '' && v !== 'N/A') { return String(v).trim(); }
        }
        return '';
    }
    function prettyLayerName(varName) {
        // layer_FloatingStructures_4 -> "Floating Structures", layer_OSSTopsides_7 -> "OSS Topsides"
        return varName.replace(/^layer_/, '').replace(/_\d+$/, '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/_/g, ' ');
    }
    function highlight(text, terms) {
        var safe = escapeHtml(text);
        if (!terms.length) { return safe; }
        // Highlight on the normalized string, map back by position (same length after NFD strip
        // only when there are no accents, so fall back to plain text if lengths differ).
        var norm = normalize(text);
        if (norm.length !== text.length) { return safe; }
        var marks = new Array(text.length).fill(false);
        terms.forEach(function (t) {
            var from = 0, idx;
            while (t && (idx = norm.indexOf(t, from)) !== -1) {
                for (var k = idx; k < idx + t.length; k++) { marks[k] = true; }
                from = idx + t.length;
            }
        });
        var out = '', open = false;
        for (var i = 0; i < text.length; i++) {
            if (marks[i] && !open) { out += '<mark>'; open = true; }
            if (!marks[i] && open) { out += '</mark>'; open = false; }
            out += escapeHtml(text[i]);
        }
        if (open) { out += '</mark>'; }
        return out;
    }

    // ---------- collect searchable layers ----------
    var groups = [];
    Object.keys(window).forEach(function (key) {
        if (key.indexOf('layer_') !== 0) { return; }
        var g = window[key];
        if (!(g instanceof L.GeoJSON)) { return; }
        var items = [];
        g.eachLayer(function (l) {
            var p = (l.feature && l.feature.properties) || {};
            var hay = SEARCH_FIELDS.map(function (f) { return p[f]; })
                .filter(function (v) { return v != null; }).join(' | ');
            items.push({
                layer: l,
                group: null, // set below
                visible: true,
                text: normalize(hay),
                title: firstField(p, TITLE_FIELDS) || '(unnamed)',
                subtitle: firstField(p, SUBTITLE_FIELDS),
                country: firstField(p, ['Country'])
            });
        });
        var entry = { key: key, group: g, label: prettyLayerName(key), items: items };
        items.forEach(function (it) { it.group = entry; });
        groups.push(entry);
    });
    if (!groups.length) { return; }

    // ---------- UI ----------
    var SearchControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function () {
            var c = L.DomUtil.create('div', 'map-search leaflet-bar');
            c.innerHTML =
                '<div class="map-search__box">' +
                '  <i class="fas fa-search map-search__icon" aria-hidden="true"></i>' +
                '  <input type="search" class="map-search__input" placeholder="Search manufacturer, port, project…" ' +
                '         aria-label="Search the map" autocomplete="off" spellcheck="false">' +
                '  <button type="button" class="map-search__clear" title="Clear search" aria-label="Clear search">&times;</button>' +
                '</div>' +
                '<div class="map-search__status" aria-live="polite"></div>' +
                '<ul class="map-search__results" role="listbox"></ul>';
            L.DomEvent.disableClickPropagation(c);
            L.DomEvent.disableScrollPropagation(c);
            return c;
        }
    });
    var control = new SearchControl();
    control.addTo(map);
    // Put the search box above the zoom / locate / measure buttons.
    var container = control.getContainer();
    container.parentNode.insertBefore(container, container.parentNode.firstChild);

    var input = container.querySelector('.map-search__input');
    var clearBtn = container.querySelector('.map-search__clear');
    var statusEl = container.querySelector('.map-search__status');
    var listEl = container.querySelector('.map-search__results');

    // ---------- filtering ----------
    var currentTerms = [];
    var currentMatches = [];
    var zoomTimer = null;
    var activeIndex = -1;
    var applying = false;

    function withLabelsPaused(fn) {
        // Adding/removing many markers fires "layeradd"/"layerremove" for each one, and the
        // qgis2web label engine recomputes all labels every time. Pause it, then run it once.
        var original = window.resetLabels;
        if (typeof original === 'function') { window.resetLabels = function () {}; }
        applying = true;
        try { fn(); } finally {
            applying = false;
            if (typeof original === 'function') {
                window.resetLabels = original;
                original(groups.map(function (g) { return g.group; }));
            }
        }
    }

    function applyFilter(query) {
        var terms = normalize(query).split(/\s+/).filter(Boolean);
        currentTerms = terms;
        var matches = [];

        withLabelsPaused(function () {
            groups.forEach(function (g) {
                var groupOnMap = map.hasLayer(g.group);
                g.items.forEach(function (it) {
                    var ok = terms.every(function (t) { return it.text.indexOf(t) !== -1; });
                    if (ok && !it.visible) { g.group.addLayer(it.layer); it.visible = true; }
                    if (!ok && it.visible) {
                        if (it.layer.isPopupOpen && it.layer.isPopupOpen()) { it.layer.closePopup(); }
                        g.group.removeLayer(it.layer);
                        it.visible = false;
                    }
                    if (ok && terms.length && groupOnMap) { matches.push(it); }
                });
            });
        });

        currentMatches = matches;
        renderResults();
        container.classList.toggle('has-query', terms.length > 0);
    }

    function renderResults() {
        activeIndex = -1;
        listEl.innerHTML = '';
        if (!currentTerms.length) {
            statusEl.textContent = '';
            return;
        }
        var n = currentMatches.length;
        if (!n) {
            statusEl.innerHTML = 'No matches in the visible layers';
            return;
        }
        statusEl.innerHTML = '<span>' + n + (n === 1 ? ' match' : ' matches') + '</span>' +
            '<button type="button" class="map-search__zoom">Zoom to all</button>';
        statusEl.querySelector('.map-search__zoom').onclick = zoomToMatches;

        var sorted = currentMatches.slice().sort(function (a, b) {
            return a.title.localeCompare(b.title) || a.group.label.localeCompare(b.group.label);
        });
        var frag = document.createDocumentFragment();
        sorted.slice(0, MAX_LISTED).forEach(function (it) {
            var li = document.createElement('li');
            li.className = 'map-search__item';
            li.setAttribute('role', 'option');
            var meta = [it.subtitle, it.country].filter(Boolean).join(' · ');
            li.innerHTML =
                '<div class="map-search__title">' + highlight(it.title, currentTerms) + '</div>' +
                '<div class="map-search__meta">' +
                '<span class="map-search__tag">' + escapeHtml(it.group.label) + '</span>' +
                highlight(meta, currentTerms) + '</div>';
            li.onclick = function () { focusItem(it); };
            frag.appendChild(li);
        });
        if (sorted.length > MAX_LISTED) {
            var more = document.createElement('li');
            more.className = 'map-search__more';
            more.textContent = '+ ' + (sorted.length - MAX_LISTED) + ' more — keep typing to narrow down';
            frag.appendChild(more);
        }
        listEl.appendChild(frag);
    }

    function boundsOf(items) {
        var b = L.latLngBounds([]);
        items.forEach(function (it) {
            if (it.layer.getLatLng) { b.extend(it.layer.getLatLng()); }
            else if (it.layer.getBounds) { b.extend(it.layer.getBounds()); }
        });
        return b;
    }

    function zoomToMatches() {
        if (!currentMatches.length) { return; }
        var b = boundsOf(currentMatches);
        if (b.isValid()) { map.flyToBounds(b, { padding: [60, 60], maxZoom: 9, duration: 0.8 }); }
    }

    function focusItem(it) {
        var l = it.layer;
        var b = boundsOf([it]);
        if (!b.isValid()) { return; }
        var target = l.getLatLng ? l.getLatLng() : b.getCenter();
        var done = function () { if (l.openPopup) { l.openPopup(target); } };
        map.once('moveend', done);
        if (l.getLatLng) { map.flyTo(target, Math.max(map.getZoom(), 10), { duration: 0.8 }); }
        else { map.flyToBounds(b, { padding: [40, 40], maxZoom: 11, duration: 0.8 }); }
    }

    function setActive(i) {
        var items = listEl.querySelectorAll('.map-search__item');
        if (!items.length) { return; }
        activeIndex = (i + items.length) % items.length;
        items.forEach(function (el, k) { el.classList.toggle('is-active', k === activeIndex); });
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    // ---------- events ----------
    var filterTimer = null;
    input.addEventListener('input', function () {
        clearTimeout(filterTimer);
        clearTimeout(zoomTimer);
        filterTimer = setTimeout(function () {
            applyFilter(input.value);
            if (currentTerms.length && currentTerms.join('').length >= 2) {
                zoomTimer = setTimeout(zoomToMatches, AUTO_ZOOM_DELAY);
            }
        }, 150);
    });
    input.addEventListener('keydown', function (e) {
        var items = listEl.querySelectorAll('.map-search__item');
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(zoomTimer);
            if (activeIndex >= 0 && items[activeIndex]) { items[activeIndex].click(); }
            else { applyFilter(input.value); zoomToMatches(); }
        } else if (e.key === 'Escape') { clearSearch(); }
    });
    // Moving the map by hand cancels a pending auto-zoom.
    map.on('dragstart zoomstart', function () { if (!applying) { clearTimeout(zoomTimer); } });

    function clearSearch() {
        clearTimeout(zoomTimer);
        input.value = '';
        applyFilter('');
        input.focus();
    }
    clearBtn.addEventListener('click', clearSearch);

    // Keep the results list in sync when layers are switched on/off in the layer tree.
    var groupSet = groups.map(function (g) { return g.group; });
    map.on('layeradd layerremove', function (e) {
        if (applying || !currentTerms.length) { return; }
        if (groupSet.indexOf(e.layer) !== -1) { setTimeout(function () { applyFilter(input.value); }, 0); }
    });

    // Collapse the results list on small screens when the map is tapped.
    map.on('click', function () { container.classList.add('is-collapsed'); });
    input.addEventListener('focus', function () { container.classList.remove('is-collapsed'); });

    // Allow linking to a search: index.html?search=Dajin
    var params = new URLSearchParams(window.location.search);
    if (params.get('search')) {
        input.value = params.get('search');
        applyFilter(input.value);
        setTimeout(zoomToMatches, 300);
    }
})();
