/* محراب — توثيق. سلوكُ الصفحة: سمة، درج، بحث، اختصارات.
   بلا اعتماديّات: GitHub Pages يخدم ملفًّا ساكنًا، فلا مسوّغَ لحزمة. */
(function () {
	'use strict';

	/* ── السمة: الداكن افتراضًا، والاختيارُ يُحفَظ ── */
	var root = document.documentElement;
	try {
		var saved = localStorage.getItem('mihrab-docs-theme');
		if (saved) { root.setAttribute('data-theme', saved); }
	} catch (e) { /* تخزينٌ محجوب — نبقى على الافتراضيّ */ }

	var themeBtn = document.getElementById('theme-toggle');
	if (themeBtn) {
		/* التسميةُ تصف **الوجهة** لا الحالة. والقالبُ يكتب «فاتح» ابتدائيًّا لأنّ
		   الداكنَ افتراضُنا؛ فإن كان المحفوظُ فاتحًا وجب تصحيحُها قبل أوّل نقرة،
		   وإلّا عرض الزرُّ «فاتح» على صفحةٍ فاتحةٍ أصلًا. */
		var startDark = root.getAttribute('data-theme')
			? root.getAttribute('data-theme') === 'dark'
			: !window.matchMedia('(prefers-color-scheme: light)').matches;
		themeBtn.textContent = startDark ? 'فاتح' : 'داكن';

		themeBtn.addEventListener('click', function () {
			var isDark = root.getAttribute('data-theme')
				? root.getAttribute('data-theme') === 'dark'
				: !window.matchMedia('(prefers-color-scheme: light)').matches;
			var next = isDark ? 'light' : 'dark';
			root.setAttribute('data-theme', next);
			try { localStorage.setItem('mihrab-docs-theme', next); } catch (e) {}
			themeBtn.textContent = next === 'dark' ? 'فاتح' : 'داكن';
		});
	}

	/* ── درجُ التنقّل على الجوال ── */
	var nav = document.querySelector('.site-nav');
	var navBtn = document.getElementById('nav-toggle');
	var scrim = document.querySelector('.nav-scrim');
	function closeNav() {
		if (!nav) { return; }
		nav.classList.remove('open');
		if (scrim) { scrim.hidden = true; }
		if (navBtn) { navBtn.setAttribute('aria-expanded', 'false'); }
	}
	if (navBtn && nav) {
		navBtn.addEventListener('click', function () {
			var open = nav.classList.toggle('open');
			if (scrim) { scrim.hidden = !open; }
			navBtn.setAttribute('aria-expanded', String(open));
		});
	}
	if (scrim) { scrim.addEventListener('click', closeNav); }
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeNav(); } });

	/* ── زرّ النسخ في كتل الكود ── */
	Array.prototype.forEach.call(document.querySelectorAll('pre'), function (pre) {
		var btn = document.createElement('button');
		btn.className = 'copy-btn';
		btn.type = 'button';
		btn.textContent = 'انسخ';
		btn.addEventListener('click', function () {
			var code = pre.querySelector('code');
			navigator.clipboard.writeText(code ? code.textContent : pre.textContent).then(function () {
				btn.textContent = 'نُسخ';
				setTimeout(function () { btn.textContent = 'انسخ'; }, 1400);
			});
		});
		pre.appendChild(btn);
	});

	/* ── البحث: فهرسٌ ساكن يُحمَّل عند أوّل استعمال، لا شبكةَ بعده ── */
	var searchInput = document.getElementById('site-search');
	var resultsBox = document.getElementById('search-results');
	var index = null;
	var indexPending = false;

	function base() { return document.body.getAttribute('data-base') || '.'; }

	function loadIndex() {
		if (index || indexPending) { return; }
		indexPending = true;
		fetch(base() + '/search-index.json')
			.then(function (r) { return r.json(); })
			.then(function (data) { index = data; render(searchInput.value); })
			.catch(function () { indexPending = false; });
	}

	function render(q) {
		if (!resultsBox) { return; }
		q = (q || '').trim();
		if (!q || !index) { resultsBox.hidden = true; resultsBox.innerHTML = ''; return; }
		var terms = q.split(/\s+/);
		var hits = index.filter(function (p) {
			var hay = p.title + ' ' + p.section + ' ' + p.text;
			return terms.every(function (t) { return hay.indexOf(t) !== -1; });
		}).slice(0, 12);

		resultsBox.innerHTML = '';
		if (!hits.length) {
			resultsBox.innerHTML = '<a href="#" class="dim">لا نتائج</a>';
			resultsBox.hidden = false;
			return;
		}
		hits.forEach(function (p) {
			var a = document.createElement('a');
			a.href = base() + '/' + p.url;
			a.innerHTML = '';
			var strong = document.createElement('span');
			strong.textContent = p.title;
			var sm = document.createElement('small');
			sm.textContent = p.section;
			a.appendChild(strong);
			a.appendChild(sm);
			resultsBox.appendChild(a);
		});
		resultsBox.hidden = false;
	}

	if (searchInput) {
		searchInput.addEventListener('focus', loadIndex);
		searchInput.addEventListener('input', function () { loadIndex(); render(this.value); });
		document.addEventListener('click', function (e) {
			if (resultsBox && !resultsBox.contains(e.target) && e.target !== searchInput) {
				resultsBox.hidden = true;
			}
		});
		/* «/» يركّز البحث — عادةٌ راسخة عند من يقرأ توثيقًا تقنيًّا */
		document.addEventListener('keydown', function (e) {
			if (e.key === '/' && document.activeElement !== searchInput
				&& !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
				e.preventDefault();
				searchInput.focus();
			}
		});
	}

	/* ════════ صفحة الاختصارات ════════ */
	var kbdTable = document.querySelector('[data-kbd-table]');
	if (!kbdTable) { return; }

	/* النظام: يُخمَّن ابتدائيًّا ثمّ يُحفَظ. عرضُ الجدولين معًا يضاعف طولَ الصفحة
	   ويجعل نصفَها ضجيجًا لكلّ قارئ. */
	var isMacDefault = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
	var platform;
	try { platform = localStorage.getItem('mihrab-docs-platform'); } catch (e) {}
	if (platform !== 'mac' && platform !== 'win') { platform = isMacDefault ? 'mac' : 'win'; }

	function applyPlatform(p) {
		platform = p;
		try { localStorage.setItem('mihrab-docs-platform', p); } catch (e) {}
		Array.prototype.forEach.call(document.querySelectorAll('.keys'), function (el) {
			el.hidden = el.getAttribute('data-platform') !== p;
		});
		Array.prototype.forEach.call(document.querySelectorAll('.seg button[data-platform]'), function (b) {
			b.setAttribute('aria-pressed', String(b.getAttribute('data-platform') === p));
		});
	}
	Array.prototype.forEach.call(document.querySelectorAll('.seg button[data-platform]'), function (b) {
		b.addEventListener('click', function () { applyPlatform(b.getAttribute('data-platform')); });
	});
	applyPlatform(platform);

	/* الترشيح: يُخفي الصفوف، ثمّ يُخفي عنوانَ أيّ قسمٍ خلا من الصفوف. */
	var filterInput = document.getElementById('kbd-filter');
	var emptyMsg = document.querySelector('.no-results');

	function filterRows(q) {
		q = (q || '').trim().toLowerCase();
		var total = 0;
		Array.prototype.forEach.call(document.querySelectorAll('.kbd-section'), function (sec) {
			var shown = 0;
			Array.prototype.forEach.call(sec.querySelectorAll('tbody tr'), function (tr) {
				var hay = (tr.getAttribute('data-search') || '').toLowerCase();
				var match = !q || hay.indexOf(q) !== -1;
				tr.hidden = !match;
				if (match) { shown++; }
			});
			sec.hidden = shown === 0;
			total += shown;
		});
		if (emptyMsg) { emptyMsg.hidden = total !== 0; }
	}
	if (filterInput) {
		filterInput.addEventListener('input', function () { filterRows(this.value); });
	}

	/* «التقط اختصارًا» — نصفُ زيارات هذه الصفحة سؤالُها «ما هذا الاختصار الذي
	   ضغطتُه بالخطأ؟» لا العكس. */
	var captureBtn = document.getElementById('capture-btn');
	var captureBox = document.querySelector('.capture-box');
	var captureField = document.getElementById('capture-field');
	var captureOut = document.querySelector('.capture-box .result');

	function chordFromEvent(e) {
		var parts = [];
		if (e.ctrlKey) { parts.push('Ctrl'); }
		if (e.metaKey) { parts.push('Cmd'); }
		if (e.shiftKey) { parts.push('Shift'); }
		if (e.altKey) { parts.push('Alt'); }
		var k = e.key;
		if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(k) !== -1) { return null; }
		if (k === ' ') { k = 'Space'; }
		if (k.length === 1) { k = k.toUpperCase(); }
		parts.push(k);
		return parts.join('+');
	}

	if (captureBtn && captureBox && captureField) {
		captureBtn.addEventListener('click', function () {
			captureBox.hidden = false;
			captureField.focus();
		});
		captureField.addEventListener('keydown', function (e) {
			e.preventDefault();
			var chord = chordFromEvent(e);
			if (!chord) { return; }
			var found = null;
			Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-chords]'), function (tr) {
				if (found) { return; }
				var list = tr.getAttribute('data-chords').split('|');
				if (list.indexOf(chord) !== -1) { found = tr; }
			});
			captureOut.textContent = '';
			var code = document.createElement('code');
			code.textContent = chord;
			captureOut.appendChild(code);
			var span = document.createElement('span');
			span.textContent = found
				? ' ← ' + found.querySelector('td').textContent
				: ' — لا أمرَ معروفًا بهذا الاختصار';
			captureOut.appendChild(span);
			if (found) {
				if (filterInput) { filterInput.value = ''; filterRows(''); }
				found.scrollIntoView({ block: 'center' });
			}
		});
	}
}());
