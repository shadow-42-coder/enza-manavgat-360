/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Scene-to-scene transition duration in ms (Marzipano's own default is
  // 1000ms, a soft cross-fade - that's what "classic" maps to below).
  var currentTransitionDuration = (data.settings && data.settings.sceneTransitionDuration != null)
    ? data.settings.sceneTransitionDuration : 1000;
  var currentTransitionKey = (data.settings && data.settings.sceneTransitionKey) || 'classic';
  var currentPresentationRoute = (data.settings && data.settings.presentationRoute) || null;

  // Scenes temporarily hidden ("under maintenance") - excluded from the
  // sidebar list and kiosk rotation, but not deleted; a scene keeps its
  // hotspots and remains reachable if directly linked from elsewhere.
  var hiddenSceneIds = {};
  data.scenes.forEach(function(s) { if (s.hidden) hiddenSceneIds[s.id] = true; });
  function applySceneVisibilityToDom(sceneId, hidden) {
    var el = document.querySelector('#sceneList .scene[data-id="' + sceneId + '"]');
    if (el) el.style.display = hidden ? 'none' : '';
  }

  // Global visual size of link-arrow and info-product icons, adjustable
  // from admin settings for screens where the default feels too small/large.
  document.documentElement.style.setProperty(
    '--hotspot-icon-scale',
    String((data.settings && data.settings.hotspotIconScale) || 1)
  );

  // Visitor-facing language: TR (default site language) / EN / RU. Detected
  // once from the browser's language on first visit, remembered afterwards,
  // switchable via the on-page language buttons. Admin panel text and the
  // underlying data.js scene names always stay Turkish - only what a visitor
  // actually reads (scene names, contact labels, WhatsApp messages) changes.
  var LANG_KEY = 'enzaVisitorLang';
  function detectLang() {
    var stored = null;
    try { stored = window.localStorage.getItem(LANG_KEY); } catch (e) {}
    if (stored === 'tr' || stored === 'en' || stored === 'ru') return stored;
    var nav = (navigator.language || navigator.userLanguage || 'tr').toLowerCase();
    if (nav.indexOf('ru') === 0) return 'ru';
    if (nav.indexOf('tr') === 0) return 'tr';
    return 'en';
  }
  var currentLang = detectLang();
  function translatedSceneName(sceneData) {
    if (currentLang === 'tr') return sceneData.name;
    var pack = data.i18n && data.i18n[currentLang];
    if (pack && pack.sceneNames && pack.sceneNames[sceneData.id]) return pack.sceneNames[sceneData.id];
    return sceneData.name;
  }
  function uiText(key, fallback) {
    if (currentLang === 'tr') return fallback;
    var pack = data.i18n && data.i18n[currentLang];
    if (pack && pack.ui && pack.ui[key]) return pack.ui[key];
    return fallback;
  }

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Mouse-wheel zoom (desktop) is already enabled by Marzipano's default
  // controls. Disable its default touch pinch-to-zoom though, since we
  // replace it below with a version that snaps back on release.
  var controls = viewer.controls();
  controls.disableMethod('pinch');

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    var editableHotspots = [];
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      var marzipanoHotspot = scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      editableHotspots.push({
        hotspot: marzipanoHotspot,
        kind: 'link',
        label: 'Yön oku → ' + hotspot.target,
        rawData: hotspot
      });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot, translatedSceneName(data), data.infoHotspots);
      var marzipanoHotspot = scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      editableHotspots.push({
        hotspot: marzipanoHotspot,
        kind: 'info',
        label: hotspot.title,
        rawData: hotspot
      });
    });

    return {
      data: data,
      scene: scene,
      view: view,
      editableHotspots: editableHotspots
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Very gentle ambient drift, active whenever the full autorotate toggle is
  // off - makes an untouched scene feel alive during a demo without being as
  // assertive as a full 360 spin.
  var idlePan = Marzipano.autorotate({
    yawSpeed: 0.008,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  viewer.setIdleMovement(6000, idlePan);

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.querySelector('.text').innerHTML = sanitize(translatedSceneName(scene.data));
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
    if (hiddenSceneIds[scene.data.id]) applySceneVisibilityToDom(scene.data.id, true);
  });

  // Translate contact labels, tooltips and WhatsApp message text for the
  // currently detected/chosen visitor language. Turkish is the site's base
  // language, so at currentLang === 'tr' the static HTML is already correct.
  var sceneListFooterMapsLink = document.querySelector('#sceneListFooter .contactLink[href*="maps.google.com"]');
  var sceneListFooterIgLink = document.querySelector('#sceneListFooter .contactLink[href*="instagram.com"]');
  var sceneListFooterWaLink = document.querySelector('#sceneListFooter .contactLink[href*="wa.me"]');
  var contactBarMapsBtn = document.querySelector('#contactBar .contactButton-maps');
  var contactBarIgBtn = document.querySelector('#contactBar .contactButton-instagram');
  var contactBarWaBtn = document.querySelector('#contactBar .contactButton-whatsapp');
  var sceneListFooterShareLink = document.querySelector('#sceneListFooter #shareLink');
  var contactBarShareBtn = document.querySelector('#contactBar #shareButton');

  // iOS doesn't have Google Maps installed by default and often opens Google
  // Maps links in a slow web view - point iPhones/iPads at Apple Maps
  // instead. No stored lat/long, so this searches by business name (still
  // reliable for a real, named business) rather than guessing coordinates.
  (function useNativeMapsLinkOnIOS() {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return;
    var appleMapsUrl = 'https://maps.apple.com/?q=' + encodeURIComponent('enza HOME Manavgat');
    if (sceneListFooterMapsLink) sceneListFooterMapsLink.href = appleMapsUrl;
    if (contactBarMapsBtn) contactBarMapsBtn.href = appleMapsUrl;
  })();

  // Captured once, before any translation runs, so switching back to
  // Turkish can restore the original text/links instead of leaving
  // whatever language was applied last.
  var originalTr = {
    mapsText: sceneListFooterMapsLink ? sceneListFooterMapsLink.textContent : null,
    igText: sceneListFooterIgLink ? sceneListFooterIgLink.textContent : null,
    waText: sceneListFooterWaLink ? sceneListFooterWaLink.textContent : null,
    waHref: sceneListFooterWaLink ? sceneListFooterWaLink.href : null,
    mapsTitle: contactBarMapsBtn ? contactBarMapsBtn.title : null,
    igTitle: contactBarIgBtn ? contactBarIgBtn.title : null,
    waTitle: contactBarWaBtn ? contactBarWaBtn.title : null,
    waBtnHref: contactBarWaBtn ? contactBarWaBtn.href : null,
    shareText: sceneListFooterShareLink ? sceneListFooterShareLink.textContent : null,
    shareTitle: contactBarShareBtn ? contactBarShareBtn.title : null
  };

  function applyUiTranslations() {
    if (currentLang === 'tr') {
      if (sceneListFooterMapsLink) sceneListFooterMapsLink.textContent = originalTr.mapsText;
      if (sceneListFooterIgLink) sceneListFooterIgLink.textContent = originalTr.igText;
      if (sceneListFooterWaLink) { sceneListFooterWaLink.textContent = originalTr.waText; sceneListFooterWaLink.href = originalTr.waHref; }
      if (contactBarMapsBtn) contactBarMapsBtn.title = originalTr.mapsTitle;
      if (contactBarIgBtn) contactBarIgBtn.title = originalTr.igTitle;
      if (contactBarWaBtn) { contactBarWaBtn.title = originalTr.waTitle; contactBarWaBtn.href = originalTr.waBtnHref; }
      if (sceneListFooterShareLink) sceneListFooterShareLink.textContent = originalTr.shareText;
      if (contactBarShareBtn) contactBarShareBtn.title = originalTr.shareTitle;
      return;
    }
    var mapsLabel = uiText('mapsLabel', null);
    var igLabel = uiText('instagramLabel', null);
    var waLabel = uiText('whatsappLabel', null);
    var waMsg = uiText('whatsappGeneralMessage', null);
    var shareLabel = uiText('shareLabel', null);
    if (mapsLabel) {
      if (sceneListFooterMapsLink) sceneListFooterMapsLink.textContent = mapsLabel;
      if (contactBarMapsBtn) contactBarMapsBtn.title = mapsLabel;
    }
    if (igLabel) {
      if (sceneListFooterIgLink) sceneListFooterIgLink.textContent = igLabel;
      if (contactBarIgBtn) contactBarIgBtn.title = igLabel;
    }
    if (waMsg) {
      var waHref = 'https://wa.me/905493320707?text=' + encodeURIComponent(waMsg);
      if (sceneListFooterWaLink) {
        sceneListFooterWaLink.href = waHref;
        if (waLabel) sceneListFooterWaLink.textContent = waLabel;
      }
      if (contactBarWaBtn) {
        contactBarWaBtn.href = waHref;
        if (waLabel) contactBarWaBtn.title = waLabel;
      }
    }
    if (shareLabel) {
      if (sceneListFooterShareLink) sceneListFooterShareLink.textContent = shareLabel;
      if (contactBarShareBtn) contactBarShareBtn.title = shareLabel;
    }
  }
  applyUiTranslations();

  // Share the tour: native share sheet where available (mobile), otherwise
  // copy the link to the clipboard with a brief visual confirmation.
  function shareTour(triggerEl) {
    var url = window.location.href.split('?')[0];
    if (currentSceneWrapper && currentView) {
      var viewParams = currentView.parameters();
      url += '?scene=' + encodeURIComponent(currentSceneWrapper.data.id) +
        '&yaw=' + viewParams.yaw.toFixed(4) + '&pitch=' + viewParams.pitch.toFixed(4);
    }
    var shareText = uiText('shareText', 'enza HOME Manavgat 360° sanal mağaza turuna göz atın!');
    if (navigator.share) {
      navigator.share({ title: document.title, text: shareText, url: url }).catch(function() {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        if (!triggerEl) return;
        var original = triggerEl.getAttribute('data-original-text');
        var copiedText = uiText('shareCopied', 'Link kopyalandı!');
        if (triggerEl.tagName === 'A' && triggerEl.textContent) {
          if (original === null) triggerEl.setAttribute('data-original-text', triggerEl.textContent);
          triggerEl.textContent = copiedText;
          setTimeout(function() { triggerEl.textContent = triggerEl.getAttribute('data-original-text'); }, 1800);
        }
      });
    } else {
      window.prompt('Bağlantıyı kopyalayın:', url);
    }
  }
  if (sceneListFooterShareLink) sceneListFooterShareLink.addEventListener('click', function() { shareTour(sceneListFooterShareLink); });
  if (contactBarShareBtn) contactBarShareBtn.addEventListener('click', function() { shareTour(null); });

  // Small language switcher for visitors (TR / EN / RU). Choice persists via
  // localStorage; switching re-renders scene names and contact labels and,
  // if a scene is currently open, its title too.
  var langSwitcher = document.createElement('div');
  langSwitcher.id = 'langSwitcher';
  ['tr', 'en', 'ru'].forEach(function(lang) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'langSwitcherButton' + (lang === currentLang ? ' active' : '');
    btn.textContent = lang.toUpperCase();
    btn.addEventListener('click', function() {
      if (lang === currentLang) return;
      currentLang = lang;
      try { window.localStorage.setItem(LANG_KEY, lang); } catch (e) {}
      Array.prototype.forEach.call(langSwitcher.querySelectorAll('.langSwitcherButton'), function(b) {
        b.classList.toggle('active', b === btn);
      });
      scenes.forEach(function(scene) {
        var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
        if (el) el.querySelector('.text').innerHTML = sanitize(translatedSceneName(scene.data));
      });
      if (currentSceneWrapper) updateSceneName(currentSceneWrapper);
      applyUiTranslations();
    });
    langSwitcher.appendChild(btn);
  });
  document.body.appendChild(langSwitcher);

  // Strip HTML tags for speech synthesis / plain-text uses.
  function stripHtmlForSpeech(html) {
    var div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.textContent || div.innerText || '').trim();
  }

  // Voices load asynchronously in most browsers - an empty getVoices() on
  // first call is normal, not an error, and by the time a visitor actually
  // taps "listen" the list has settled. Without picking a matching voice
  // explicitly, an utterance can silently fall back to a non-Turkish voice
  // that mispronounces every Turkish letter/word.
  function pickVoiceForLang(langTag) {
    if (!window.speechSynthesis) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    var exact = voices.filter(function(v) { return v.lang && v.lang.toLowerCase() === langTag.toLowerCase(); });
    if (exact.length) return exact[0];
    var prefix = langTag.split('-')[0].toLowerCase();
    var loose = voices.filter(function(v) { return v.lang && v.lang.toLowerCase().indexOf(prefix) === 0; });
    return loose.length ? loose[0] : null;
  }

  // Splits narration text into a short opening line plus the rest, so
  // listening starts with one sentence instead of a whole paragraph - the
  // rest is only spoken if the visitor asks for it.
  function splitNarrationTeaser(fullText) {
    var m = /^([\s\S]{0,140}?[.!?])\s*([\s\S]*)$/.exec(fullText);
    if (m && m[2] && m[2].trim().length > 0) {
      return { teaser: m[1], rest: m[2].trim() };
    }
    return { teaser: fullText, rest: '' };
  }

  // Visitor-side favorite products list (their own browser only, nothing
  // sent anywhere until they choose to send it via WhatsApp).
  var FAVORITES_KEY = 'enzaFavoriteProducts';
  function getFavorites() {
    try { return JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]'); } catch (e) { return []; }
  }
  function isProductFavorited(title) {
    return getFavorites().some(function(f) { return f.title === title; });
  }
  function toggleProductFavorite(title, sceneName) {
    var favs = getFavorites();
    var idx = favs.findIndex(function(f) { return f.title === title; });
    if (idx !== -1) favs.splice(idx, 1);
    else favs.push({ title: stripHtmlForSpeech(title), sceneName: sceneName });
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    updateFavoritesButton();
  }

  // Small floating-heart burst for instant feedback when a product is
  // favorited, positioned relative to the button that was tapped.
  function spawnHeartBurst(anchorEl) {
    var rect = anchorEl.getBoundingClientRect();
    var heart = document.createElement('div');
    heart.className = 'heartBurst';
    heart.textContent = '♥';
    heart.style.left = (rect.left + rect.width / 2) + 'px';
    heart.style.top = rect.top + 'px';
    document.body.appendChild(heart);
    setTimeout(function() { if (heart.parentNode) heart.parentNode.removeChild(heart); }, 900);
  }

  var favoritesButton = document.createElement('button');
  favoritesButton.type = 'button';
  favoritesButton.id = 'favoritesButton';
  document.body.appendChild(favoritesButton);

  function updateFavoritesButton() {
    var favs = getFavorites();
    if (!favs.length) {
      favoritesButton.style.display = 'none';
    } else {
      favoritesButton.style.display = 'flex';
      favoritesButton.textContent = '♥ ' + favs.length;
    }
  }
  updateFavoritesButton();

  favoritesButton.addEventListener('click', function() {
    var favs = getFavorites();
    var overlay = document.createElement('div');
    overlay.id = 'favoritesOverlay';
    var box = document.createElement('div');
    box.id = 'favoritesBox';
    var boxTitle = document.createElement('div');
    boxTitle.id = 'favoritesTitle';
    boxTitle.textContent = uiText('favoritesTitle', 'Favori Ürünlerim');
    var list = document.createElement('div');
    list.id = 'favoritesList';
    favs.forEach(function(f) {
      var row = document.createElement('div');
      row.className = 'favoritesRow';
      var label = document.createElement('span');
      label.textContent = f.title;
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', function() {
        toggleProductFavorite(f.title, f.sceneName);
        row.parentNode.removeChild(row);
        if (!getFavorites().length) overlay.remove();
      });
      row.appendChild(label);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
    var sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.id = 'favoritesSendButton';
    sendBtn.textContent = uiText('favoritesSendLabel', "Hepsini WhatsApp'tan Gönder");
    sendBtn.addEventListener('click', function() {
      var lines = getFavorites().map(function(f) {
        return '- ' + f.title + (f.sceneName ? (' (' + f.sceneName + ')') : '');
      });
      var msg = uiText('favoritesMessage', 'Merhaba, aşağıdaki ürünler hakkında bilgi almak istiyorum:') + '\n' + lines.join('\n');
      window.open('https://wa.me/905493320707?text=' + encodeURIComponent(msg), '_blank');
    });
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'favoritesClose';
    closeBtn.textContent = uiText('closeLabel', 'Kapat');
    closeBtn.addEventListener('click', function() { overlay.remove(); });

    box.appendChild(boxTitle);
    box.appendChild(list);
    box.appendChild(sendBtn);
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    overlay.addEventListener('click', function(event) { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  });

  // Campaign/announcement banner. Text lives in data.settings.campaignText -
  // empty/missing means no banner. Dismissing it is remembered per exact
  // text, so a new announcement always shows even if an old one was closed.
  var campaignBanner = document.createElement('div');
  campaignBanner.id = 'campaignBanner';
  var campaignBannerText = document.createElement('span');
  campaignBannerText.id = 'campaignBannerText';
  var campaignBannerClose = document.createElement('button');
  campaignBannerClose.type = 'button';
  campaignBannerClose.id = 'campaignBannerClose';
  campaignBannerClose.textContent = '✕';
  campaignBanner.appendChild(campaignBannerText);
  campaignBanner.appendChild(campaignBannerClose);
  document.body.appendChild(campaignBanner);

  var CAMPAIGN_DISMISS_KEY = 'enzaCampaignDismissed';
  function showCampaignBanner(text) {
    if (!text) { campaignBanner.classList.remove('visible'); return; }
    var dismissed = null;
    try { dismissed = window.sessionStorage.getItem(CAMPAIGN_DISMISS_KEY); } catch (e) {}
    if (dismissed === text) { campaignBanner.classList.remove('visible'); return; }
    campaignBannerText.textContent = text;
    campaignBanner.classList.add('visible');
  }
  campaignBannerClose.addEventListener('click', function() {
    try { window.sessionStorage.setItem(CAMPAIGN_DISMISS_KEY, campaignBannerText.textContent); } catch (e) {}
    campaignBanner.classList.remove('visible');
  });
  showCampaignBanner(data.settings && data.settings.campaignText);

  // Live preview from the admin settings panel - doesn't touch sessionStorage
  // dismissal state, just shows/hides the banner on this screen right now.
  function previewCampaignBanner(text) {
    if (!text) { campaignBanner.classList.remove('visible'); return; }
    campaignBannerText.textContent = text;
    campaignBanner.classList.add('visible');
  }

  // Background music: one persistent <audio> element, entirely decoupled
  // from switchScene(), so playback never restarts or stops when moving
  // between scenes. The button only appears if the admin has turned this on
  // AND an actual audio file has been placed at docs/audio/background-music.mp3
  // (a static site can't synthesize music - that file has to be supplied).
  var bgMusic = document.createElement('audio');
  bgMusic.loop = true;
  bgMusic.preload = 'none';
  bgMusic.src = 'audio/background-music.mp3';

  var musicToggle = document.createElement('button');
  musicToggle.type = 'button';
  musicToggle.id = 'musicToggle';
  musicToggle.title = 'Fon Müziği';
  musicToggle.textContent = '🎵';
  musicToggle.style.display = 'none';

  var musicFileMissing = false;
  bgMusic.addEventListener('error', function() {
    musicFileMissing = true;
    musicToggle.style.display = 'none';
  });

  function updateMusicToggleVisibility() {
    var enabled = !!(data.settings && data.settings.backgroundMusicEnabled);
    musicToggle.style.display = (enabled && !musicFileMissing) ? 'flex' : 'none';
  }

  musicToggle.addEventListener('click', function() {
    if (bgMusic.paused) {
      bgMusic.play().catch(function() { musicFileMissing = true; updateMusicToggleVisibility(); });
      musicToggle.classList.add('playing');
    } else {
      bgMusic.pause();
      musicToggle.classList.remove('playing');
    }
  });

  document.body.appendChild(bgMusic);
  document.body.appendChild(musicToggle);
  updateMusicToggleVisibility();

  // Seasonal decoration overlay: a purely cosmetic, pointer-events-none
  // canvas of falling/floating particles over the whole viewport. Picked
  // per-effect from data.settings.seasonalEffect ('none' or missing = off).
  (function setupSeasonalEffect() {
    var key = data.settings && data.settings.seasonalEffect;
    if (!key || key === 'none') return;
    var EFFECT_DEFS = {
      snow: { count: 60, shape: 'circle', colors: ['rgba(255,255,255,0.85)'], size: [2, 5], speedY: [20, 50], speedX: [-10, 10], sway: false, twinkle: false },
      confetti: { count: 50, shape: 'rect', colors: ['#e0432c', '#ffd23f', '#25d366', '#2f8fd6', '#ffffff'], size: [4, 8], speedY: [40, 90], speedX: [-30, 30], sway: false, twinkle: false, spin: true },
      hearts: { count: 25, shape: 'heart', colors: ['#e0432c', '#ff7a6b'], size: [10, 16], speedY: [-25, -12], speedX: [-8, 8], sway: true, twinkle: false },
      leaves: { count: 35, shape: 'leaf', colors: ['#c9762a', '#a85428', '#d99a3d'], size: [7, 12], speedY: [15, 35], speedX: [-5, 5], sway: true, twinkle: false, spin: true },
      sparkles: { count: 45, shape: 'circle', colors: ['#ffd23f', '#fff4c2'], size: [2, 4], speedY: [5, 15], speedX: [-5, 5], sway: false, twinkle: true }
    };
    var def = EFFECT_DEFS[key];
    if (!def) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'seasonalEffectCanvas';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function rand(a, b) { return a + Math.random() * (b - a); }

    function spawnParticle(recycle) {
      var p = recycle || {};
      p.x = Math.random() * canvas.width;
      p.y = recycle ? -10 : Math.random() * canvas.height;
      p.size = rand(def.size[0], def.size[1]);
      p.speedY = rand(def.speedY[0], def.speedY[1]);
      p.speedX = rand(def.speedX[0], def.speedX[1]);
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = rand(-2, 2);
      p.color = def.colors[Math.floor(Math.random() * def.colors.length)];
      p.phase = Math.random() * Math.PI * 2;
      p.opacity = 1;
      return p;
    }

    var particles = [];
    for (var i = 0; i < def.count; i++) particles.push(spawnParticle());

    function drawHeart(x, y, size, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 16, size / 16);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(0, 2, -2, 0, -5, 0);
      ctx.bezierCurveTo(-9, 0, -9, 5, -9, 5);
      ctx.bezierCurveTo(-9, 9, -5, 12, 0, 16);
      ctx.bezierCurveTo(5, 12, 9, 9, 9, 5);
      ctx.bezierCurveTo(9, 5, 9, 0, 5, 0);
      ctx.bezierCurveTo(2, 0, 0, 2, 0, 4);
      ctx.fill();
      ctx.restore();
    }

    function drawParticle(p) {
      ctx.save();
      ctx.globalAlpha = p.opacity;
      if (def.shape === 'circle') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (def.shape === 'rect') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else if (def.shape === 'leaf') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (def.shape === 'heart') {
        drawHeart(p.x, p.y, p.size, p.color);
      }
      ctx.restore();
    }

    var lastTimestamp = null;
    function loop(timestamp) {
      if (lastTimestamp == null) lastTimestamp = timestamp;
      var dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
      lastTimestamp = timestamp;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.y += p.speedY * dt;
        p.x += p.speedX * dt + (def.sway ? Math.sin(p.phase + timestamp / 800) * 8 * dt : 0);
        if (def.spin) p.rotation += p.rotationSpeed * dt;
        if (def.twinkle) p.opacity = 0.4 + 0.6 * Math.abs(Math.sin(p.phase + timestamp / 500));
        if (p.y > canvas.height + 20 || p.y < -20 || p.x < -20 || p.x > canvas.width + 20) {
          spawnParticle(p);
        }
        drawParticle(p);
      }
      window.requestAnimationFrame(loop);
    }
    window.requestAnimationFrame(loop);
  })();

  // First-visit tip: shown once (localStorage-tracked), explains dragging to
  // look around and tapping arrows to move between rooms.
  (function setupTourTip() {
    var TOUR_TIP_KEY = 'enzaTourTipShown';
    var shown = null;
    try { shown = window.localStorage.getItem(TOUR_TIP_KEY); } catch (e) {}
    if (shown) return;
    var tip = document.createElement('div');
    tip.id = 'tourTip';
    var tipTextEl = document.createElement('span');
    tipTextEl.textContent = uiText('tourTipText', 'Etrafa bakmak için sürükleyin. Odalar arasında geçmek için oklara dokunun.');
    var tipClose = document.createElement('button');
    tipClose.type = 'button';
    tipClose.id = 'tourTipClose';
    tipClose.textContent = uiText('closeLabel', 'Anladım');
    tip.appendChild(tipTextEl);
    tip.appendChild(tipClose);
    document.body.appendChild(tip);

    function dismiss() {
      tip.classList.remove('visible');
      try { window.localStorage.setItem(TOUR_TIP_KEY, '1'); } catch (e) {}
      setTimeout(function() { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 400);
    }
    tipClose.addEventListener('click', dismiss);
    setTimeout(function() { tip.classList.add('visible'); }, 1200);
    setTimeout(dismiss, 9000);
  })();

  // Shared one-time dismissible tip banner (localStorage-tracked per key) -
  // used for anything shown once to explain a feature the visitor might not
  // otherwise notice, without stacking multiple tip mechanisms on top of
  // each other.
  function showOneTimeTip(id, storageKey, text, visibleDelayMs, autoDismissMs) {
    var already = null;
    try { already = window.localStorage.getItem(storageKey); } catch (e) {}
    if (already) return;
    try { window.localStorage.setItem(storageKey, '1'); } catch (e) {}
    var tip = document.createElement('div');
    tip.id = id;
    tip.className = 'miniTip';
    var tipTextEl = document.createElement('span');
    tipTextEl.textContent = text;
    var tipClose = document.createElement('button');
    tipClose.type = 'button';
    tipClose.textContent = uiText('closeLabel', 'Anladım');
    tip.appendChild(tipTextEl);
    tip.appendChild(tipClose);
    document.body.appendChild(tip);
    function dismiss() {
      tip.classList.remove('visible');
      setTimeout(function() { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 400);
    }
    tipClose.addEventListener('click', dismiss);
    setTimeout(function() { tip.classList.add('visible'); }, visibleDelayMs);
    setTimeout(dismiss, autoDismissMs);
  }

  // Voice-narration tip: shown once, the first time a visitor opens any
  // product card, pointing out the 🔊 listen button rather than at page
  // load (before there's anything on screen to point at).
  var voiceTipEligible = true;
  try { voiceTipEligible = !window.localStorage.getItem('enzaVoiceTipShown'); } catch (e) {}
  function showVoiceTipOnce() {
    if (!voiceTipEligible) return;
    voiceTipEligible = false;
    showOneTimeTip('voiceTip', 'enzaVoiceTipShown',
      uiText('voiceTipText', '🔊 simgesine dokunarak ürünü sesli dinleyebilirsin.'), 500, 7000);
  }

  // Suggest landscape on mobile if the visitor is in portrait - a wider
  // view shows more of each room.
  if (document.body.classList.contains('mobile') && window.innerHeight > window.innerWidth) {
    showOneTimeTip('rotateTip', 'enzaRotateTipShown',
      uiText('rotateTipText', '📱 Daha geniş bir görünüm için telefonunu yatay çevirebilirsin.'), 2500, 9000);
  }

  // "Add to home screen" hint, mobile only, shown a bit later so it doesn't
  // compete with the drag/rotate tips right at open.
  (function setupHomeScreenTip() {
    if (!document.body.classList.contains('mobile')) return;
    var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
    if (isStandalone) return;
    showOneTimeTip('homeScreenTip', 'enzaHomeScreenTipShown',
      uiText('homeScreenTipText', 'Bu turu bir uygulama gibi kullanmak için tarayıcı menüsünden "Ana Ekrana Ekle"yi deneyebilirsin.'), 16000, 24000);
  })();

  // Mobile: pinch with two fingers to zoom; release to snap back to the
  // scene's normal view instead of staying zoomed in.
  var currentView = null;
  var currentBaseFov = null;
  var currentSceneNumber = null;
  var currentSceneWrapper = null;
  setupPinchZoom(panoElement);

  // Keyboard look controls for visitors: arrow keys and WASD both pan the
  // view (W/up = look up, S/down = look down, A/left = turn left, D/right =
  // turn right). Runs as a continuous loop so holding a key pans smoothly.
  (function setupKeyboardLook() {
    var PAN_SPEED = 1.1; // radians per second
    var keys = { up: false, down: false, left: false, right: false };
    var KEY_MAP = {
      arrowup: 'up', w: 'up',
      arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left',
      arrowright: 'right', d: 'right'
    };
    document.addEventListener('keydown', function(event) {
      var mapped = KEY_MAP[event.key.toLowerCase()];
      if (!mapped) return;
      var activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
      keys[mapped] = true;
      event.preventDefault();
    });
    document.addEventListener('keyup', function(event) {
      var mapped = KEY_MAP[event.key.toLowerCase()];
      if (mapped) keys[mapped] = false;
    });
    window.addEventListener('blur', function() {
      keys.up = keys.down = keys.left = keys.right = false;
    });

    var lastTimestamp = null;
    function loop(timestamp) {
      var active = keys.up || keys.down || keys.left || keys.right;
      if (active && currentView) {
        if (lastTimestamp == null) lastTimestamp = timestamp;
        var dt = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
        lastTimestamp = timestamp;
        var params = currentView.parameters();
        var yaw = params.yaw, pitch = params.pitch;
        if (keys.left) yaw -= PAN_SPEED * dt;
        if (keys.right) yaw += PAN_SPEED * dt;
        if (keys.up) pitch += PAN_SPEED * dt;
        if (keys.down) pitch -= PAN_SPEED * dt;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
        currentView.setParameters({ yaw: yaw, pitch: pitch });
      } else {
        lastTimestamp = null;
      }
      window.requestAnimationFrame(loop);
    }
    window.requestAnimationFrame(loop);
  })();

  // TEMP: product-link collector tool, remove once all product hotspots
  // are placed. Add ?pos=1 to the URL: tap anywhere on the pano, paste the
  // product link, tap "Ekle". Walk through the whole store this way, then
  // tap "Kopyala" to copy every entry as text and send it back in one go.
  if (/[?&]pos=1/.test(window.location.search)) {
    if (window.sessionStorage.getItem('enzaAdminAuthed') === '1') {
      initAdminPanel();
    } else {
      showAdminLogin(initAdminPanel);
    }
  }

  function initAdminPanel() {
    setupPositionCollector(panoElement);
    setupAutoLogout();
    loadScript('vendor/jszip.min.js', function() {
      loadScript('photo-tool.js', function() {
        document.body.classList.add('photo-tool-ready');
        document.dispatchEvent(new Event('enzaPhotoToolReady'));
      });
    });
  }

  function setupAutoLogout() {
    var IDLE_LIMIT_MS = 20 * 60 * 1000;
    var idleTimer = null;
    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function() {
        window.sessionStorage.removeItem('enzaAdminAuthed');
        window.location.reload();
      }, IDLE_LIMIT_MS);
    }
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function(evt) {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  var CREDENTIALS_KEY = 'enzaAdminCredentials';
  var DEFAULT_ADMIN_USER = 'ENZAHOME-MANAVGAT';
  var DEFAULT_ADMIN_PASS = 'yedi10077';
  // Fixed master passphrase that always works, independent of whatever custom
  // password is set from the panel. This is the only "forgot my password"
  // recovery path possible on a static site with no backend/email. Logging
  // in with it resets any custom password back to the default pair.
  var RECOVERY_PASSWORD = 'ENZA-KURTARMA-9471';

  function getStoredCredentials() {
    try {
      var raw = window.localStorage.getItem(CREDENTIALS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.pass) return parsed;
      }
    } catch (e) {}
    return { user: DEFAULT_ADMIN_USER, pass: DEFAULT_ADMIN_PASS };
  }

  function showAdminLogin(onSuccess) {
    var overlay = document.createElement('div');
    overlay.id = 'adminLoginOverlay';
    var box = document.createElement('div');
    box.id = 'adminLoginBox';
    var title = document.createElement('div');
    title.id = 'adminLoginTitle';
    title.textContent = 'Yönetim Paneli Girişi';
    var userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.placeholder = 'Kullanıcı adı';
    userInput.autocomplete = 'off';
    var passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.placeholder = 'Şifre';
    var errorLine = document.createElement('div');
    errorLine.id = 'adminLoginError';
    var submitButton = document.createElement('button');
    submitButton.textContent = 'Giriş';

    box.appendChild(title);
    box.appendChild(userInput);
    box.appendChild(passInput);
    box.appendChild(errorLine);
    box.appendChild(submitButton);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    userInput.focus();

    function attempt() {
      var creds = getStoredCredentials();
      var isMainMatch = userInput.value === creds.user && passInput.value === creds.pass;
      var isRecoveryMatch = passInput.value === RECOVERY_PASSWORD;
      if (isMainMatch || isRecoveryMatch) {
        window.sessionStorage.setItem('enzaAdminAuthed', '1');
        if (isRecoveryMatch && !isMainMatch) {
          // Forgot the custom password - recovery resets it back to default
          // so a new one can be set right away from the settings panel.
          window.localStorage.removeItem(CREDENTIALS_KEY);
        }
        overlay.remove();
        onSuccess();
      } else {
        errorLine.textContent = 'Kullanıcı adı veya şifre yanlış.';
        passInput.value = '';
      }
    }

    submitButton.addEventListener('click', attempt);
    passInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') attempt();
    });
    userInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') passInput.focus();
    });
  }

  function loadScript(src, onload) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = onload;
    document.head.appendChild(s);
  }

  function setupPositionCollector(element) {
    document.body.classList.add('admin-mode');

    // Single-level-per-step undo/redo history for this session. Each
    // performed action pushes { label, undo, redo } here; "Geri Al" (or
    // Ctrl+Z) pops and undoes the most recent one, moving it onto the redo
    // stack; "İleri Al" (or Ctrl+I) does the reverse. Any new action clears
    // the redo stack, matching standard undo/redo behavior.
    var history = [];
    var redoStack = [];
    function pushHistory(label, undoFn, redoFn) {
      history.push({ label: label, undo: undoFn, redo: redoFn });
      redoStack = [];
      updateUndoButton();
      updateRedoButton();
    }
    function updateUndoButton() {
      if (!undoButton) return;
      undoButton.disabled = history.length === 0;
      undoButton.title = history.length ? ('Geri al: ' + history[history.length - 1].label) : '';
    }
    function updateRedoButton() {
      if (!redoButton) return;
      redoButton.disabled = redoStack.length === 0;
      redoButton.title = redoStack.length ? ('İleri al: ' + redoStack[redoStack.length - 1].label) : '';
    }
    function performUndo() {
      var last = history.pop();
      if (!last) return;
      last.undo();
      redoStack.push(last);
      updateUndoButton();
      updateRedoButton();
    }
    function performRedo() {
      var last = redoStack.pop();
      if (!last || !last.redo) return;
      last.redo();
      history.push(last);
      updateUndoButton();
      updateRedoButton();
    }

    var ADD_KEY = 'enzaPosCollectorEntries';
    var MOVE_KEY = 'enzaPosCollectorMoves';
    var ARROW_KEY = 'enzaPosCollectorArrows';
    var REMOVE_KEY = 'enzaPosCollectorRemovals';
    var EDIT_KEY = 'enzaPosCollectorEdits';
    var SETTINGS_KEY = 'enzaPosCollectorSettings';
    var NEW_SCENE_KEY = 'enzaPosCollectorNewScenes';
    var entries = [];
    var moves = [];
    var arrows = [];
    var removals = [];
    var edits = [];
    var settingsChanges = [];
    var newScenes = [];
    try { entries = JSON.parse(window.localStorage.getItem(ADD_KEY) || '[]'); } catch (e) { entries = []; }
    try { moves = JSON.parse(window.localStorage.getItem(MOVE_KEY) || '[]'); } catch (e) { moves = []; }
    try { arrows = JSON.parse(window.localStorage.getItem(ARROW_KEY) || '[]'); } catch (e) { arrows = []; }
    try { removals = JSON.parse(window.localStorage.getItem(REMOVE_KEY) || '[]'); } catch (e) { removals = []; }
    try { edits = JSON.parse(window.localStorage.getItem(EDIT_KEY) || '[]'); } catch (e) { edits = []; }
    try { settingsChanges = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '[]'); } catch (e) { settingsChanges = []; }
    try { newScenes = JSON.parse(window.localStorage.getItem(NEW_SCENE_KEY) || '[]'); } catch (e) { newScenes = []; }
    var pendingCoords = null;
    var editingEntry = null;
    var mode = 'product'; // 'product' | 'link' | 'delete' | 'photo' | 'settings' | 'newScene'
    // Set while a "move product to another scene" flow is waiting for the
    // admin to click the new spot on the (already-switched-to) target scene.
    var pendingMove = null; // { sourceSceneId, entry, title }

    var box = document.createElement('div');
    box.id = 'posFinderBox';

    var modeRow = document.createElement('div');
    modeRow.id = 'posFinderModeRow';
    var productModeButton = document.createElement('button');
    productModeButton.textContent = 'Ürün Ekle';
    productModeButton.className = 'posFinderModeButton active';
    var linkModeButton = document.createElement('button');
    linkModeButton.textContent = 'Yön Oku Ekle';
    linkModeButton.className = 'posFinderModeButton';
    var deleteModeButton = document.createElement('button');
    deleteModeButton.textContent = 'Sil';
    deleteModeButton.className = 'posFinderModeButton posFinderModeButtonDanger';
    var photoModeButton = document.createElement('button');
    photoModeButton.textContent = 'Fotoğraflar';
    photoModeButton.className = 'posFinderModeButton';
    var settingsModeButton = document.createElement('button');
    settingsModeButton.textContent = 'Ayarlar';
    settingsModeButton.className = 'posFinderModeButton';
    var newSceneModeButton = document.createElement('button');
    newSceneModeButton.textContent = 'Yeni Sahne';
    newSceneModeButton.className = 'posFinderModeButton';
    var listModeButton = document.createElement('button');
    listModeButton.textContent = 'Ürün Listesi';
    listModeButton.className = 'posFinderModeButton';
    var mapModeButton = document.createElement('button');
    mapModeButton.textContent = 'Bağlantı Haritası';
    mapModeButton.className = 'posFinderModeButton';
    var orderModeButton = document.createElement('button');
    orderModeButton.textContent = 'Sahne Sırası';
    orderModeButton.className = 'posFinderModeButton';
    modeRow.appendChild(productModeButton);
    modeRow.appendChild(linkModeButton);
    modeRow.appendChild(deleteModeButton);
    modeRow.appendChild(photoModeButton);
    modeRow.appendChild(settingsModeButton);
    modeRow.appendChild(newSceneModeButton);
    modeRow.appendChild(listModeButton);
    modeRow.appendChild(mapModeButton);
    modeRow.appendChild(orderModeButton);

    var coordsLine = document.createElement('div');
    coordsLine.id = 'posFinderCoords';
    coordsLine.textContent = 'Boş bir yere tıklayın veya bir ikonu sürükleyin';

    var inputRow = document.createElement('div');
    inputRow.id = 'posFinderInputRow';
    var linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.id = 'posFinderInput';
    linkInput.placeholder = 'Ürün linkini yapıştırın';
    var sceneSelect = document.createElement('select');
    sceneSelect.id = 'posFinderSceneSelect';
    sceneSelect.style.display = 'none';
    var addButton = document.createElement('button');
    addButton.textContent = 'Ekle';
    addButton.id = 'posFinderAdd';
    inputRow.appendChild(linkInput);
    inputRow.appendChild(sceneSelect);
    inputRow.appendChild(addButton);

    // Badge buttons: only shown while editing an existing product (info
    // hotspot) in product mode. Applied live to the hotspot's own DOM.
    var badgeRow = document.createElement('div');
    badgeRow.id = 'posFinderBadgeRow';
    badgeRow.style.display = 'none';
    ['Yeni', 'İndirimde', 'Tükendi'].forEach(function(label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'posFinderBadgeButton';
      btn.setAttribute('data-badge', label);
      btn.textContent = label;
      btn.addEventListener('click', function() { setBadge(label); });
      badgeRow.appendChild(btn);
    });
    var clearBadgeButton = document.createElement('button');
    clearBadgeButton.type = 'button';
    clearBadgeButton.className = 'posFinderBadgeButton posFinderBadgeClearButton';
    clearBadgeButton.textContent = 'Rozet Yok';
    clearBadgeButton.addEventListener('click', function() { setBadge(null); });
    badgeRow.appendChild(clearBadgeButton);

    // Description editor: only shown while editing an existing product (info
    // hotspot) in product mode, alongside the link field. Two simple format
    // buttons insert HTML markup around the current textarea selection - kept
    // deliberately basic (raw-HTML textarea, no full rich-text editor) since
    // this is meant for quick touch-ups, not authoring from scratch.
    var descRow = document.createElement('div');
    descRow.id = 'posFinderDescRow';
    descRow.style.display = 'none';
    var descToolbar = document.createElement('div');
    descToolbar.id = 'posFinderDescToolbar';
    var descBoldButton = document.createElement('button');
    descBoldButton.type = 'button';
    descBoldButton.className = 'posFinderDescFormatButton';
    descBoldButton.textContent = 'K Kalın';
    var descBulletButton = document.createElement('button');
    descBulletButton.type = 'button';
    descBulletButton.className = 'posFinderDescFormatButton';
    descBulletButton.textContent = '≡ Madde İşareti';
    descToolbar.appendChild(descBoldButton);
    descToolbar.appendChild(descBulletButton);
    var descTextarea = document.createElement('textarea');
    descTextarea.id = 'posFinderDescInput';
    descTextarea.placeholder = 'Ürün açıklaması';
    var descHint = document.createElement('div');
    descHint.id = 'posFinderDescHint';
    descHint.textContent = 'Metni seçip Kalın veya Madde İşareti butonuna basın. Kaydetmek için "Güncelle"ye basın.';
    descRow.appendChild(descToolbar);
    descRow.appendChild(descTextarea);
    descRow.appendChild(descHint);

    function wrapDescSelection(before, after) {
      var start = descTextarea.selectionStart;
      var end = descTextarea.selectionEnd;
      var value = descTextarea.value;
      var selected = value.slice(start, end);
      var replacement = before + selected + after;
      descTextarea.value = value.slice(0, start) + replacement + value.slice(end);
      descTextarea.focus();
      descTextarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }
    descBoldButton.addEventListener('click', function() {
      wrapDescSelection('<b>', '</b>');
    });
    descBulletButton.addEventListener('click', function() {
      var start = descTextarea.selectionStart;
      var end = descTextarea.selectionEnd;
      var value = descTextarea.value;
      var selected = value.slice(start, end);
      var lines = selected.length ? selected.split('\n') : [''];
      var listHtml = '<ul>' + lines.map(function(l) { return '<li>' + l + '</li>'; }).join('') + '</ul>';
      descTextarea.value = value.slice(0, start) + listHtml + value.slice(end);
      descTextarea.focus();
      var pos = start + listHtml.length;
      descTextarea.setSelectionRange(pos, pos);
    });

    function extractDescFromHtml(html) {
      var match = /<p>([\s\S]*)<\/p>\s*$/.exec(html || '');
      return match ? match[1] : (html || '');
    }
    function rebuildDescHtml(originalHtml, newInner) {
      var imgMatch = /^\s*(<img[^>]*>)/.exec(originalHtml || '');
      var imgTag = imgMatch ? imgMatch[1] : '';
      return imgTag + '<p>' + newInner + '</p>';
    }

    function setBadge(label) {
      if (!editingEntry || editingEntry.kind !== 'info') return;
      var entryRef = editingEntry;
      var rawData = entryRef.rawData;
      var oldBadge = rawData.badge || null;
      var newBadge = label || null;
      if (oldBadge === newBadge) return;
      rawData.badge = newBadge;
      updateHotspotBadgeDom(entryRef);
      Array.prototype.forEach.call(badgeRow.querySelectorAll('.posFinderBadgeButton'), function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-badge') === newBadge);
      });
      var editRecord = { scene: currentSceneNumber, kind: 'badge', title: rawData.title, oldBadge: oldBadge, newBadge: newBadge };
      edits.push(editRecord);
      saveEdits();
      coordsLine.textContent = newBadge ? ('Rozet ayarlandı: ' + newBadge) : 'Rozet kaldırıldı.';
      pushHistory('rozet ayarlama (' + rawData.title + ')', function() {
        rawData.badge = oldBadge;
        updateHotspotBadgeDom(entryRef);
        edits = edits.filter(function(e) { return e !== editRecord; });
        saveEdits();
      }, function() {
        rawData.badge = newBadge;
        updateHotspotBadgeDom(entryRef);
        edits.push(editRecord);
        saveEdits();
      });
    }

    var actionRow = document.createElement('div');
    actionRow.id = 'posFinderActionRow';
    var countLabel = document.createElement('span');
    countLabel.id = 'posFinderCount';
    var copyButton = document.createElement('button');
    copyButton.textContent = 'Kopyala';
    copyButton.id = 'posFinderCopy';
    var clearButton = document.createElement('button');
    clearButton.textContent = 'Temizle';
    clearButton.id = 'posFinderClear';
    var undoButton = document.createElement('button');
    undoButton.textContent = 'Geri Al';
    undoButton.id = 'posFinderUndo';
    undoButton.disabled = true;
    var redoButton = document.createElement('button');
    redoButton.textContent = 'İleri Al';
    redoButton.id = 'posFinderRedo';
    redoButton.disabled = true;
    actionRow.appendChild(countLabel);
    actionRow.appendChild(undoButton);
    actionRow.appendChild(redoButton);
    actionRow.appendChild(copyButton);
    actionRow.appendChild(clearButton);

    undoButton.addEventListener('click', performUndo);
    redoButton.addEventListener('click', performRedo);

    document.addEventListener('keydown', function(event) {
      if (event.ctrlKey || event.metaKey) {
        var key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'i') return;
        // Let native text-field undo work normally while typing; only hijack
        // Ctrl+Z/Ctrl+I for the panel's own undo/redo outside text inputs.
        var activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
        event.preventDefault();
        if (key === 'z') performUndo(); else performRedo();
        return;
      }
      if (event.key === 'Escape') {
        if (pendingMove) {
          pendingMove = null;
          listStatus.textContent = 'Taşıma iptal edildi.';
          return;
        }
        // Cancel whatever add/edit is in progress without committing it.
        if (pendingCoords || editingEntry) {
          pendingCoords = null;
          resetInputRowForAdd();
          coordsLine.classList.remove('ready');
          coordsLine.textContent = 'İptal edildi.';
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        }
      }
    });

    // Photo replacement panel (its own tile-generation UI, no pano clicking).
    var photoPanel = document.createElement('div');
    photoPanel.id = 'posFinderPhotoPanel';
    photoPanel.style.display = 'none';

    var photoSceneSelect = document.createElement('select');
    photoSceneSelect.id = 'posFinderPhotoSceneSelect';

    var photoFileInput = document.createElement('input');
    photoFileInput.type = 'file';
    photoFileInput.accept = 'image/*';
    photoFileInput.id = 'posFinderPhotoFile';

    var photoStatus = document.createElement('div');
    photoStatus.id = 'posFinderPhotoStatus';
    photoStatus.textContent = 'Kütüphaneler yükleniyor...';

    var photoProgressOuter = document.createElement('div');
    photoProgressOuter.id = 'posFinderPhotoProgressOuter';
    var photoProgressInner = document.createElement('div');
    photoProgressInner.id = 'posFinderPhotoProgressInner';
    photoProgressOuter.appendChild(photoProgressInner);
    photoProgressOuter.style.display = 'none';

    var photoDownloadLink = document.createElement('a');
    photoDownloadLink.id = 'posFinderPhotoDownload';
    photoDownloadLink.textContent = 'ZIP dosyasını indir';
    photoDownloadLink.style.display = 'none';

    photoPanel.appendChild(photoSceneSelect);
    photoPanel.appendChild(photoFileInput);
    photoPanel.appendChild(photoStatus);
    photoPanel.appendChild(photoProgressOuter);
    photoPanel.appendChild(photoDownloadLink);

    // Settings panel: scene rename, default start scene, contact info.
    var settingsPanel = document.createElement('div');
    settingsPanel.id = 'posFinderSettingsPanel';
    settingsPanel.style.display = 'none';

    // Collapsible accordion item: a clickable icon+title header that shows/
    // hides its body. Returns the body element (existing call sites keep
    // doing bodyEl.appendChild(...) unchanged); the full header+body wrapper
    // that actually needs to go into the panel is on body._accordionWrapper.
    function settingsSection(titleText, icon, defaultOpen) {
      var wrapper = document.createElement('div');
      wrapper.className = 'posFinderAccordionItem' + (defaultOpen ? ' open' : '');
      var header = document.createElement('button');
      header.type = 'button';
      header.className = 'posFinderAccordionHeader';
      var iconEl = document.createElement('span');
      iconEl.className = 'posFinderAccordionIcon';
      iconEl.textContent = icon || '•';
      var titleEl = document.createElement('span');
      titleEl.className = 'posFinderAccordionTitleText';
      titleEl.textContent = titleText;
      var chevron = document.createElement('span');
      chevron.className = 'posFinderAccordionChevron';
      chevron.textContent = defaultOpen ? '▾' : '▸';
      header.appendChild(iconEl);
      header.appendChild(titleEl);
      header.appendChild(chevron);
      header.addEventListener('click', function() {
        var isOpen = wrapper.classList.toggle('open');
        chevron.textContent = isOpen ? '▾' : '▸';
      });
      var body = document.createElement('div');
      body.className = 'posFinderSettingsSection posFinderAccordionBody';
      wrapper.appendChild(header);
      wrapper.appendChild(body);
      body._accordionWrapper = wrapper;
      return body;
    }

    function settingsGroupHeader(text) {
      var el = document.createElement('div');
      el.className = 'posFinderGroupHeader';
      el.textContent = text;
      return el;
    }

    // -- Rename scene --
    var renameSection = settingsSection('Sahne adını değiştir', '✏️');
    var renameSceneSelect = document.createElement('select');
    var renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.placeholder = 'Yeni sahne adı';
    var renameButton = document.createElement('button');
    renameButton.textContent = 'Yeniden Adlandır';
    renameSection.appendChild(renameSceneSelect);
    renameSection.appendChild(renameInput);
    renameSection.appendChild(renameButton);

    // -- Default start scene --
    var startSection = settingsSection('Varsayılan açılış sahnesi', '🏠');
    var startSceneSelect = document.createElement('select');
    var startButton = document.createElement('button');
    startButton.textContent = 'Varsayılan Yap';
    startSection.appendChild(startSceneSelect);
    startSection.appendChild(startButton);

    // -- Seasonal decoration effect --
    var SEASONAL_OPTIONS = [
      { key: 'none', label: 'Kapalı' },
      { key: 'snow', label: 'Kar' },
      { key: 'confetti', label: 'Konfeti' },
      { key: 'hearts', label: 'Kalpler' },
      { key: 'leaves', label: 'Yapraklar' },
      { key: 'sparkles', label: 'Parıltılar' }
    ];
    var seasonalSection = settingsSection('Sezonluk dekorasyon efekti', '🎉');
    var seasonalSelect = document.createElement('select');
    SEASONAL_OPTIONS.forEach(function(opt) {
      var el = document.createElement('option');
      el.value = opt.key;
      el.textContent = opt.label;
      seasonalSelect.appendChild(el);
    });
    var seasonalButton = document.createElement('button');
    seasonalButton.textContent = 'Kaydet';
    var seasonalHint = document.createElement('div');
    seasonalHint.className = 'posFinderPasswordHint';
    seasonalHint.textContent = 'Ekranın üzerinde hafif bir dekor efekti (kar, konfeti, kalp, yaprak, parıltı) uçuşur. Kaydettikten sonra siteye yansıması için her zamanki gibi "Kopyala" ile gönder.';
    seasonalSection.appendChild(seasonalSelect);
    seasonalSection.appendChild(seasonalButton);
    seasonalSection.appendChild(seasonalHint);

    seasonalButton.addEventListener('click', function() {
      var key = seasonalSelect.value;
      var label = SEASONAL_OPTIONS.filter(function(o) { return o.key === key; })[0].label;
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'seasonalEffect'; });
      settingsChanges.push({ type: 'seasonalEffect', key: key, label: label });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = 'Sezonluk efekt kaydedildi: ' + label;
      pushHistory('sezonluk efekt ayarı', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'Sezonluk efekt kaydedildi: ' + label;
      });
    });

    // -- Background music toggle button --
    var musicSection = settingsSection('Fon müziği', '🎵');
    var musicCheckboxLabel = document.createElement('label');
    musicCheckboxLabel.className = 'posFinderCheckboxLabel';
    var musicCheckbox = document.createElement('input');
    musicCheckbox.type = 'checkbox';
    var musicCheckboxText = document.createElement('span');
    musicCheckboxText.textContent = 'Açık olursa: ziyaretçiler için 🎵 fon müziği aç/kapa düğmesi görünür. Sahneler arası geçince müzik kesilmeden devam eder.';
    musicCheckboxLabel.appendChild(musicCheckbox);
    musicCheckboxLabel.appendChild(musicCheckboxText);
    var musicButton = document.createElement('button');
    musicButton.textContent = 'Kaydet';
    var musicHint = document.createElement('div');
    musicHint.className = 'posFinderPasswordHint';
    musicHint.textContent = 'Bunun çalışması için bir müzik dosyası gerekiyor. Bana bir mp3 gönder, "docs/audio/background-music.mp3" olarak ekleyeyim.';
    musicSection.appendChild(musicCheckboxLabel);
    musicSection.appendChild(musicButton);
    musicSection.appendChild(musicHint);

    musicButton.addEventListener('click', function() {
      var enabled = musicCheckbox.checked;
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'backgroundMusic'; });
      settingsChanges.push({ type: 'backgroundMusic', enabled: enabled });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = enabled ? 'Fon müziği düğmesi açıldı.' : 'Fon müziği düğmesi kapatıldı.';
      pushHistory('fon müziği ayarı', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = enabled ? 'Fon müziği düğmesi açıldı.' : 'Fon müziği düğmesi kapatıldı.';
      });
    });

    // -- Hotspot icon size (link arrows + product info icons) --
    var HOTSPOT_SCALE_OPTIONS = [
      { key: 'small', label: 'Küçük', value: 0.8 },
      { key: 'normal', label: 'Normal', value: 1 },
      { key: 'large', label: 'Büyük', value: 1.3 }
    ];
    var hotspotScaleSection = settingsSection('Ok/bilgi ikonu boyutu', '🔍');
    var hotspotScaleRow = document.createElement('div');
    hotspotScaleRow.className = 'posFinderTransitionRow';
    var hotspotScaleButtonsByKey = {};
    var selectedHotspotScale = HOTSPOT_SCALE_OPTIONS[1];
    HOTSPOT_SCALE_OPTIONS.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'posFinderTransitionButton';
      btn.textContent = opt.label;
      btn.addEventListener('click', function() {
        selectedHotspotScale = opt;
        Object.keys(hotspotScaleButtonsByKey).forEach(function(k) {
          hotspotScaleButtonsByKey[k].classList.toggle('active', k === opt.key);
        });
        // Live preview immediately, same session, no save needed to look.
        document.documentElement.style.setProperty('--hotspot-icon-scale', String(opt.value));
      });
      hotspotScaleRow.appendChild(btn);
      hotspotScaleButtonsByKey[opt.key] = btn;
    });
    var hotspotScaleButton = document.createElement('button');
    hotspotScaleButton.textContent = 'Kaydet';
    var hotspotScaleHint = document.createElement('div');
    hotspotScaleHint.className = 'posFinderPasswordHint';
    hotspotScaleHint.textContent = 'Seçtiğinde ikonlar hemen büyüyüp küçülür, canlı görürsün. "Kaydet" siteye kalıcı olarak yansıtır.';
    hotspotScaleSection.appendChild(hotspotScaleRow);
    hotspotScaleSection.appendChild(hotspotScaleButton);
    hotspotScaleSection.appendChild(hotspotScaleHint);

    function getEffectiveHotspotScale() {
      var pending = settingsChanges.filter(function(c) { return c.type === 'hotspotIconScale'; }).pop();
      if (pending) return pending.value;
      return (data.settings && data.settings.hotspotIconScale) || 1;
    }

    hotspotScaleButton.addEventListener('click', function() {
      var beforeSnapshot = settingsChanges.slice();
      var beforeScale = (data.settings && data.settings.hotspotIconScale) || 1;
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'hotspotIconScale'; });
      settingsChanges.push({ type: 'hotspotIconScale', value: selectedHotspotScale.value, label: selectedHotspotScale.label });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = 'İkon boyutu kaydedildi: ' + selectedHotspotScale.label;
      pushHistory('ikon boyutu ayarı', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
        document.documentElement.style.setProperty('--hotspot-icon-scale', String(beforeScale));
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        document.documentElement.style.setProperty('--hotspot-icon-scale', String(selectedHotspotScale.value));
        settingsStatus.textContent = 'İkon boyutu kaydedildi: ' + selectedHotspotScale.label;
      });
    });

    // -- Featured product: auto-opens its bubble when its scene is entered --
    var featuredSection = settingsSection('Öne çıkan ürün', '⭐');
    var featuredCheckboxLabel = document.createElement('label');
    featuredCheckboxLabel.className = 'posFinderCheckboxLabel';
    var featuredCheckbox = document.createElement('input');
    featuredCheckbox.type = 'checkbox';
    var featuredCheckboxText = document.createElement('span');
    featuredCheckboxText.textContent = 'Açık olursa: seçtiğin ürünün bulunduğu sahneye girildiğinde balonu otomatik açılır.';
    featuredCheckboxLabel.appendChild(featuredCheckbox);
    featuredCheckboxLabel.appendChild(featuredCheckboxText);
    var featuredSelect = document.createElement('select');
    var dailyPickCheckboxLabel = document.createElement('label');
    dailyPickCheckboxLabel.className = 'posFinderCheckboxLabel';
    var dailyPickCheckbox = document.createElement('input');
    dailyPickCheckbox.type = 'checkbox';
    var dailyPickCheckboxText = document.createElement('span');
    dailyPickCheckboxText.textContent = '"Günün Seçkisi": elle seçmek yerine, her gün otomatik farklı bir ürün öne çıkar.';
    dailyPickCheckboxLabel.appendChild(dailyPickCheckbox);
    dailyPickCheckboxLabel.appendChild(dailyPickCheckboxText);
    dailyPickCheckbox.addEventListener('change', function() {
      featuredSelect.disabled = dailyPickCheckbox.checked;
    });
    var featuredButton = document.createElement('button');
    featuredButton.textContent = 'Kaydet';
    featuredSection.appendChild(featuredCheckboxLabel);
    featuredSection.appendChild(dailyPickCheckboxLabel);
    featuredSection.appendChild(featuredSelect);
    featuredSection.appendChild(featuredButton);

    featuredButton.addEventListener('click', function() {
      var enabled = featuredCheckbox.checked;
      var dailyPick = dailyPickCheckbox.checked;
      var title = featuredSelect.value;
      if (enabled && !dailyPick && !title) { settingsStatus.textContent = 'Lütfen bir ürün seç.'; return; }
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'featuredProduct'; });
      settingsChanges.push({ type: 'featuredProduct', enabled: enabled, title: title, dailyPick: dailyPick });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = !enabled ? 'Öne çıkan ürün kapatıldı.' : (dailyPick ? 'Günün Seçkisi açıldı.' : ('Öne çıkan ürün kaydedildi: "' + title + '"'));
      pushHistory('öne çıkan ürün ayarı', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = !enabled ? 'Öne çıkan ürün kapatıldı.' : (dailyPick ? 'Günün Seçkisi açıldı.' : ('Öne çıkan ürün kaydedildi: "' + title + '"'));
      });
    });

    // -- Scene transition effect: pick a preset, test it live on a real
    // scene switch without saving, only commit with "Kaydet". --
    var TRANSITION_PRESETS = [
      { key: 'classic', label: 'Klasik (mevcut)', duration: 1000 },
      { key: 'fast', label: 'Hızlı', duration: 400 },
      { key: 'slow', label: 'Yavaş / Sinematik', duration: 2000 },
      { key: 'zoom', label: 'Yakınlaşarak Geçiş', duration: 900 },
      { key: 'instant', label: 'Anında (efektsiz)', duration: 0 }
    ];
    var selectedTransitionPreset = TRANSITION_PRESETS[0];

    var transitionSection = settingsSection('Sahne geçiş efekti', '🎞️');
    var transitionButtonsRow = document.createElement('div');
    transitionButtonsRow.className = 'posFinderTransitionRow';
    var transitionButtonsByKey = {};
    TRANSITION_PRESETS.forEach(function(preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'posFinderTransitionButton';
      btn.textContent = preset.label;
      btn.addEventListener('click', function() {
        selectedTransitionPreset = preset;
        Object.keys(transitionButtonsByKey).forEach(function(k) {
          transitionButtonsByKey[k].classList.toggle('active', k === preset.key);
        });
      });
      transitionButtonsRow.appendChild(btn);
      transitionButtonsByKey[preset.key] = btn;
    });
    var transitionActionRow = document.createElement('div');
    transitionActionRow.className = 'posFinderTransitionRow';
    var transitionTestButton = document.createElement('button');
    transitionTestButton.type = 'button';
    transitionTestButton.textContent = 'Test Et (sıradaki sahneye geç)';
    var transitionSaveButton = document.createElement('button');
    transitionSaveButton.type = 'button';
    transitionSaveButton.textContent = 'Bu Efekti Kaydet';
    transitionActionRow.appendChild(transitionTestButton);
    transitionActionRow.appendChild(transitionSaveButton);
    var transitionHint = document.createElement('div');
    transitionHint.className = 'posFinderPasswordHint';
    transitionHint.textContent = 'Bir efekt seç, "Test Et" ile hemen dene (kaydetmeden). Beğenirsen "Kaydet"e bas; beğenmezsen "Klasik"i seçip eski haline dönebilirsin.';
    transitionSection.appendChild(transitionButtonsRow);
    transitionSection.appendChild(transitionActionRow);
    transitionSection.appendChild(transitionHint);

    transitionTestButton.addEventListener('click', function() {
      if (!currentSceneWrapper) return;
      var idx = data.scenes.findIndex(function(s) { return s.id === currentSceneWrapper.data.id; });
      if (idx === -1) return;
      var nextSceneData = data.scenes[(idx + 1) % data.scenes.length];
      var nextSceneWrapper = findSceneById(nextSceneData.id);
      if (!nextSceneWrapper) return;
      var savedDuration = currentTransitionDuration;
      var savedKey = currentTransitionKey;
      currentTransitionDuration = selectedTransitionPreset.duration;
      currentTransitionKey = selectedTransitionPreset.key;
      switchScene(nextSceneWrapper);
      currentTransitionDuration = savedDuration;
      currentTransitionKey = savedKey;
    });

    transitionSaveButton.addEventListener('click', function() {
      var beforeSnapshot = settingsChanges.slice();
      var beforeDuration = currentTransitionDuration;
      var beforeKey = currentTransitionKey;
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'sceneTransition'; });
      settingsChanges.push({ type: 'sceneTransition', duration: selectedTransitionPreset.duration, key: selectedTransitionPreset.key, label: selectedTransitionPreset.label });
      var afterSnapshot = settingsChanges.slice();
      currentTransitionDuration = selectedTransitionPreset.duration;
      currentTransitionKey = selectedTransitionPreset.key;
      saveSettingsChanges();
      settingsStatus.textContent = 'Geçiş efekti kaydedildi: ' + selectedTransitionPreset.label;
      pushHistory('sahne geçiş efekti kaydetme', function() {
        settingsChanges = beforeSnapshot;
        currentTransitionDuration = beforeDuration;
        currentTransitionKey = beforeKey;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        currentTransitionDuration = selectedTransitionPreset.duration;
        currentTransitionKey = selectedTransitionPreset.key;
        saveSettingsChanges();
        settingsStatus.textContent = 'Geçiş efekti kaydedildi: ' + selectedTransitionPreset.label;
      });
    });

    // -- Campaign/announcement banner --
    var campaignSection = settingsSection('Kampanya/duyuru şeridi', '📢');
    var campaignInput = document.createElement('input');
    campaignInput.type = 'text';
    campaignInput.placeholder = 'Örn: Bu hafta sonu tüm oturma gruplarında %10 indirim!';
    campaignInput.maxLength = 140;
    var campaignButton = document.createElement('button');
    campaignButton.textContent = 'Duyuruyu Yayınla';
    var campaignClearButton = document.createElement('button');
    campaignClearButton.textContent = 'Duyuruyu Kaldır';
    var campaignHint = document.createElement('div');
    campaignHint.className = 'posFinderPasswordHint';
    campaignHint.textContent = 'Yazarken üstte canlı önizlemesini görürsün. "Duyuruyu Yayınla" bilgiyi kaydeder — siteye kalıcı olarak yansıması için her zamanki gibi "Kopyala" ile gönderip uygulamamı bekle.';
    campaignSection.appendChild(campaignInput);
    campaignSection.appendChild(campaignButton);
    campaignSection.appendChild(campaignClearButton);
    campaignSection.appendChild(campaignHint);

    // The "true" campaign text right now: a pending (unsaved-to-data.js but
    // already recorded) settingsChanges entry wins over the static one baked
    // into data.js, so the banner reflects what's really about to be applied.
    function getEffectiveCampaignText() {
      var pending = settingsChanges.filter(function(c) { return c.type === 'campaignText'; }).pop();
      if (pending) return pending.text;
      return (data.settings && data.settings.campaignText) || '';
    }

    campaignInput.addEventListener('input', function() {
      previewCampaignBanner(campaignInput.value.trim());
    });

    campaignButton.addEventListener('click', function() {
      var text = campaignInput.value.trim();
      if (!text) { settingsStatus.textContent = 'Duyuru metni boş olamaz.'; return; }
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'campaignText'; });
      settingsChanges.push({ type: 'campaignText', text: text });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = 'Duyuru kaydedildi.';
      showCampaignBanner(text);
      pushHistory('kampanya duyurusu yayınlama', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
        showCampaignBanner(getEffectiveCampaignText());
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'Duyuru kaydedildi.';
        showCampaignBanner(text);
      });
    });

    campaignClearButton.addEventListener('click', function() {
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'campaignText'; });
      settingsChanges.push({ type: 'campaignText', text: '' });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      campaignInput.value = '';
      previewCampaignBanner('');
      settingsStatus.textContent = 'Duyuru kaldırıldı.';
      pushHistory('kampanya duyurusu kaldırma', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
        showCampaignBanner(getEffectiveCampaignText());
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'Duyuru kaldırıldı.';
        showCampaignBanner('');
      });
    });

    // -- "Tükendi" restock-notification toggle (off by default: badge alone
    // doesn't mean the warehouse is actually empty, so this must be an
    // explicit, separate opt-in). --
    var tukendiSection = settingsSection('"Tükendi" rozetinde otomatik bildirim', '📴');
    var tukendiCheckboxLabel = document.createElement('label');
    tukendiCheckboxLabel.className = 'posFinderCheckboxLabel';
    var tukendiCheckbox = document.createElement('input');
    tukendiCheckbox.type = 'checkbox';
    var tukendiCheckboxText = document.createElement('span');
    tukendiCheckboxText.textContent = 'Açık olursa: "Tükendi" etiketli ürünlerde WhatsApp butonu otomatik olarak "stoğa gelince haber ver" mesajına döner.';
    tukendiCheckboxLabel.appendChild(tukendiCheckbox);
    tukendiCheckboxLabel.appendChild(tukendiCheckboxText);
    var tukendiButton = document.createElement('button');
    tukendiButton.textContent = 'Kaydet';
    tukendiSection.appendChild(tukendiCheckboxLabel);
    tukendiSection.appendChild(tukendiButton);

    tukendiButton.addEventListener('click', function() {
      var enabled = tukendiCheckbox.checked;
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'tukendiNotify'; });
      settingsChanges.push({ type: 'tukendiNotify', enabled: enabled });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = enabled ? 'Tükendi bildirimi açıldı.' : 'Tükendi bildirimi kapatıldı.';
      pushHistory('tükendi bildirimi ayarı', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = enabled ? 'Tükendi bildirimi açıldı.' : 'Tükendi bildirimi kapatıldı.';
      });
    });

    // -- Kiosk/showroom mode interval --
    var kioskSection = settingsSection('Vitrin modu geçiş süresi', '🕐');
    var kioskIntervalInput = document.createElement('input');
    kioskIntervalInput.type = 'number';
    kioskIntervalInput.min = '3';
    kioskIntervalInput.max = '120';
    kioskIntervalInput.placeholder = 'Saniye (ör. 8)';
    var kioskIntervalButton = document.createElement('button');
    kioskIntervalButton.textContent = 'Süreyi Kaydet';
    var kioskHint = document.createElement('div');
    kioskHint.className = 'posFinderPasswordHint';
    kioskHint.textContent = 'Mağazada bir ekranda sürekli açık kalacaksa, adrese "?kiosk=1" ekle — tur kendi kendine bu sürede sahne değiştirerek gezinir.';
    kioskSection.appendChild(kioskIntervalInput);
    kioskSection.appendChild(kioskIntervalButton);
    kioskSection.appendChild(kioskHint);

    kioskIntervalButton.addEventListener('click', function() {
      var seconds = parseInt(kioskIntervalInput.value, 10);
      if (!seconds || seconds < 3) { settingsStatus.textContent = 'Lütfen 3 saniyeden büyük bir süre girin.'; return; }
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'kioskInterval'; });
      settingsChanges.push({ type: 'kioskInterval', seconds: seconds });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = 'Vitrin modu geçiş süresi ' + seconds + ' saniye olarak kaydedildi.';
      pushHistory('vitrin modu süresi değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'Vitrin modu geçiş süresi ' + seconds + ' saniye olarak kaydedildi.';
      });
    });

    // -- Sunum Modu: which scenes take part in the guided/auto-pilot tour,
    // and in what order (reuses the current scene order; unchecked scenes
    // are simply skipped rather than reordered separately). --
    var presentationSection = settingsSection('Sunum Modu rotası', '🎬');
    var presentationList = document.createElement('div');
    presentationList.id = 'posFinderPresentationList';
    var presentationSaveButton = document.createElement('button');
    presentationSaveButton.type = 'button';
    presentationSaveButton.textContent = 'Rotayı Kaydet';
    var presentationHint = document.createElement('div');
    presentationHint.className = 'posFinderPasswordHint';
    presentationHint.textContent = 'İşaretli sahneler, sitedeki "▶ Sunumu Başlat" butonuna basıldığında bu sırayla otomatik gezilir. En az 2 sahne işaretli olmalı.';
    presentationSection.appendChild(presentationList);
    presentationSection.appendChild(presentationSaveButton);
    presentationSection.appendChild(presentationHint);

    function populatePresentationList() {
      if (presentationList.dataset.filled) return;
      var currentRoute = (data.settings && data.settings.presentationRoute) || null;
      data.scenes.forEach(function(s, i) {
        var row = document.createElement('label');
        row.className = 'posFinderPresentationRow';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = s.id;
        cb.checked = currentRoute ? currentRoute.indexOf(s.id) !== -1 : true;
        var span = document.createElement('span');
        span.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
        row.appendChild(cb);
        row.appendChild(span);
        presentationList.appendChild(row);
      });
      presentationList.dataset.filled = '1';
    }

    presentationSaveButton.addEventListener('click', function() {
      var checked = Array.prototype.filter.call(presentationList.querySelectorAll('input[type="checkbox"]'), function(cb) { return cb.checked; })
        .map(function(cb) { return cb.value; });
      if (checked.length < 2) { settingsStatus.textContent = 'Sunum Modu için en az 2 sahne işaretli olmalı.'; return; }
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'presentationRoute'; });
      settingsChanges.push({ type: 'presentationRoute', route: checked });
      var afterSnapshot = settingsChanges.slice();
      currentPresentationRoute = checked;
      saveSettingsChanges();
      settingsStatus.textContent = 'Sunum Modu rotası kaydedildi (' + checked.length + ' sahne).';
      pushHistory('sunum modu rotası kaydetme', function() {
        settingsChanges = beforeSnapshot;
        currentPresentationRoute = null;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        currentPresentationRoute = checked;
        saveSettingsChanges();
        settingsStatus.textContent = 'Sunum Modu rotası kaydedildi (' + checked.length + ' sahne).';
      });
    });

    // -- Opening view angle for the currently viewed scene --
    var openingViewSection = settingsSection('Sahnenin açılış açısı', '👁️');
    var openingViewButton = document.createElement('button');
    openingViewButton.textContent = 'Şu Anki Görünümü Bu Sahnenin Açılışı Yap';
    var openingViewHint = document.createElement('div');
    openingViewHint.className = 'posFinderPasswordHint';
    openingViewHint.textContent = 'Panoyu istediğin açıya çevir, sonra bu butona bas — o sahne artık her zaman bu açıyla açılır.';
    openingViewSection.appendChild(openingViewButton);
    openingViewSection.appendChild(openingViewHint);

    openingViewButton.addEventListener('click', function() {
      if (!currentSceneWrapper || !currentView) { settingsStatus.textContent = 'Önce bir sahneye gidin.'; return; }
      var params = currentView.parameters();
      var sceneId = currentSceneWrapper.data.id;
      var displayName = currentSceneWrapper.data.name.replace(/^\d+\.\s*/, '');
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return !(c.type === 'openingView' && c.sceneId === sceneId); });
      settingsChanges.push({ type: 'openingView', sceneId: sceneId, sceneName: currentSceneWrapper.data.name, yaw: params.yaw, pitch: params.pitch, fov: params.fov });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = '"' + displayName + '" için yeni açılış görünümü kaydedildi.';
      pushHistory('açılış görünümü ayarlama', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = '"' + displayName + '" için yeni açılış görünümü kaydedildi.';
      });
    });

    // -- Scene notes (admin-only, stays in this browser, never sent to Claude) --
    var NOTES_KEY = 'enzaSceneNotes';
    var sceneNotes = {};
    try { sceneNotes = JSON.parse(window.localStorage.getItem(NOTES_KEY) || '{}'); } catch (e) { sceneNotes = {}; }
    function saveSceneNotes() { window.localStorage.setItem(NOTES_KEY, JSON.stringify(sceneNotes)); }

    var notesSection = settingsSection('Sahne notu (sadece sen görürsün, siteye yansımaz)', '📝');
    var notesSceneSelect = document.createElement('select');
    var notesTextarea = document.createElement('textarea');
    notesTextarea.placeholder = 'Bu sahneyle ilgili kendine not bırak (ör. "yeniden çekilecek", "açı düzeltilmeli")...';
    notesTextarea.rows = 3;
    var notesSaveButton = document.createElement('button');
    notesSaveButton.textContent = 'Notu Kaydet';
    var notesExportButton = document.createElement('button');
    notesExportButton.type = 'button';
    notesExportButton.textContent = 'Tüm Notları Dışa Aktar';
    notesSection.appendChild(notesSceneSelect);
    notesSection.appendChild(notesTextarea);
    notesSection.appendChild(notesSaveButton);
    notesSection.appendChild(notesExportButton);

    notesSceneSelect.addEventListener('change', function() {
      notesTextarea.value = sceneNotes[notesSceneSelect.value] || '';
    });

    notesExportButton.addEventListener('click', function() {
      var lines = [];
      data.scenes.forEach(function(s, i) {
        var note = sceneNotes[s.id];
        if (note && note.trim()) {
          lines.push((i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '') + ':');
          lines.push(note.trim());
          lines.push('');
        }
      });
      if (!lines.length) { settingsStatus.textContent = 'Henüz kaydedilmiş bir sahne notu yok.'; return; }
      var text = lines.join('\n');
      var blob = new Blob([text], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var today = new Date().toISOString().slice(0, 10);
      a.download = 'enza-manavgat-sahne-notlari-' + today + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      settingsStatus.textContent = 'Tüm notlar indirildi.';
    });

    notesSaveButton.addEventListener('click', function() {
      var sceneId = notesSceneSelect.value;
      if (!sceneId) return;
      var before = sceneNotes[sceneId] || '';
      var after = notesTextarea.value;
      if (before === after) return;
      sceneNotes[sceneId] = after;
      saveSceneNotes();
      settingsStatus.textContent = 'Not kaydedildi.';
      pushHistory('sahne notu kaydetme', function() {
        sceneNotes[sceneId] = before;
        saveSceneNotes();
        if (notesSceneSelect.value === sceneId) notesTextarea.value = before;
      }, function() {
        sceneNotes[sceneId] = after;
        saveSceneNotes();
        if (notesSceneSelect.value === sceneId) notesTextarea.value = after;
        settingsStatus.textContent = 'Not kaydedildi.';
      });
    });

    // -- Contact info --
    var contactSection = settingsSection('İletişim bilgileri', '📞');
    var phone1Input = document.createElement('input');
    phone1Input.type = 'text';
    phone1Input.placeholder = 'Telefon 1 (ör. 0549 332 07 07)';
    var phone2Input = document.createElement('input');
    phone2Input.type = 'text';
    phone2Input.placeholder = 'Telefon 2';
    var instagramInput = document.createElement('input');
    instagramInput.type = 'text';
    instagramInput.placeholder = 'Instagram kullanıcı adı (ör. yatasenzahomemanavgat)';
    var mapsInput = document.createElement('input');
    mapsInput.type = 'text';
    mapsInput.placeholder = 'Google Haritalar linki';
    var contactButton = document.createElement('button');
    contactButton.textContent = 'İletişim Bilgilerini Güncelle';
    contactSection.appendChild(phone1Input);
    contactSection.appendChild(phone2Input);
    contactSection.appendChild(instagramInput);
    contactSection.appendChild(mapsInput);
    contactSection.appendChild(contactButton);

    // -- Backup --
    var backupSection = settingsSection('Yedekleme', '💾');
    var backupButton = document.createElement('button');
    backupButton.id = 'posFinderBackup';
    backupButton.textContent = 'Tüm Veriyi Yedekle (JSON indir)';
    backupSection.appendChild(backupButton);
    backupButton.addEventListener('click', function() {
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var today = new Date().toISOString().slice(0, 10);
      a.download = 'enza-manavgat-yedek-' + today + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      settingsStatus.textContent = 'Yedek dosyası indirildi.';
    });

    // -- Change admin password --
    var passwordSection = settingsSection('Yönetici şifresini değiştir', '🔑');
    var newUserInput = document.createElement('input');
    newUserInput.type = 'text';
    newUserInput.placeholder = 'Yeni kullanıcı adı';
    var newPassInput = document.createElement('input');
    newPassInput.type = 'password';
    newPassInput.placeholder = 'Yeni şifre';
    var confirmPassInput = document.createElement('input');
    confirmPassInput.type = 'password';
    confirmPassInput.placeholder = 'Yeni şifre (tekrar)';
    var passwordButton = document.createElement('button');
    passwordButton.textContent = 'Şifreyi Değiştir';
    var passwordHint = document.createElement('div');
    passwordHint.className = 'posFinderPasswordHint';
    passwordHint.textContent = 'Şifreni unutursan, kurtarma şifresiyle her zaman girebilirsin: ' + RECOVERY_PASSWORD + ' (bunu bir yere not et).';
    passwordSection.appendChild(newUserInput);
    passwordSection.appendChild(newPassInput);
    passwordSection.appendChild(confirmPassInput);
    passwordSection.appendChild(passwordButton);
    passwordSection.appendChild(passwordHint);

    passwordButton.addEventListener('click', function() {
      var newUser = newUserInput.value.trim();
      var newPass = newPassInput.value;
      var confirmPass = confirmPassInput.value;
      if (!newUser || !newPass) { settingsStatus.textContent = 'Kullanıcı adı ve yeni şifre gerekli.'; return; }
      if (newPass !== confirmPass) { settingsStatus.textContent = 'Yeni şifreler eşleşmiyor.'; return; }
      if (newPass === RECOVERY_PASSWORD) { settingsStatus.textContent = 'Bu şifre kurtarma şifresiyle aynı olamaz, başka bir şifre seç.'; return; }
      var before = getStoredCredentials();
      var after = { user: newUser, pass: newPass };
      window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(after));
      newPassInput.value = '';
      confirmPassInput.value = '';
      settingsStatus.textContent = 'Şifre değiştirildi. Bir sonraki girişte yeni bilgileri kullan.';
      pushHistory('şifre değiştirme', function() {
        window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(before));
        settingsStatus.textContent = 'Şifre değişikliği geri alındı.';
      }, function() {
        window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(after));
        settingsStatus.textContent = 'Şifre değişikliği yinelendi.';
      });
    });

    // -- Logout --
    var logoutSection = settingsSection('Oturum / Çıkış', '🚪');
    var logoutButton = document.createElement('button');
    logoutButton.id = 'posFinderLogout';
    logoutButton.textContent = 'Çıkış Yap';
    logoutSection.appendChild(logoutButton);
    logoutButton.addEventListener('click', function() {
      if (!window.confirm('Yönetim panelinden çıkmak istediğine emin misin?')) return;
      window.sessionStorage.removeItem('enzaAdminAuthed');
      window.location.reload();
    });

    var settingsStatus = document.createElement('div');
    settingsStatus.id = 'posFinderSettingsStatus';

    settingsPanel.appendChild(settingsGroupHeader('Sahne Ayarları'));
    settingsPanel.appendChild(renameSection._accordionWrapper);
    settingsPanel.appendChild(startSection._accordionWrapper);
    settingsPanel.appendChild(openingViewSection._accordionWrapper);
    settingsPanel.appendChild(transitionSection._accordionWrapper);
    settingsPanel.appendChild(notesSection._accordionWrapper);

    settingsPanel.appendChild(settingsGroupHeader('Ziyaretçi Deneyimi'));
    settingsPanel.appendChild(featuredSection._accordionWrapper);
    settingsPanel.appendChild(seasonalSection._accordionWrapper);
    settingsPanel.appendChild(musicSection._accordionWrapper);
    settingsPanel.appendChild(kioskSection._accordionWrapper);
    settingsPanel.appendChild(presentationSection._accordionWrapper);
    settingsPanel.appendChild(hotspotScaleSection._accordionWrapper);

    settingsPanel.appendChild(settingsGroupHeader('İletişim & Pazarlama'));
    settingsPanel.appendChild(campaignSection._accordionWrapper);
    settingsPanel.appendChild(tukendiSection._accordionWrapper);
    settingsPanel.appendChild(contactSection._accordionWrapper);

    settingsPanel.appendChild(settingsGroupHeader('Hesap & Yedekleme'));
    settingsPanel.appendChild(backupSection._accordionWrapper);
    settingsPanel.appendChild(passwordSection._accordionWrapper);
    settingsPanel.appendChild(logoutSection._accordionWrapper);

    settingsPanel.appendChild(settingsStatus);

    // New scene creation panel: name + photo + which existing scenes to connect to.
    var newScenePanel = document.createElement('div');
    newScenePanel.id = 'posFinderNewScenePanel';
    newScenePanel.style.display = 'none';

    var newSceneInfoSection = settingsSection('Yeni sahne bilgisi', '🖼️', true);
    var newSceneNameInput = document.createElement('input');
    newSceneNameInput.type = 'text';
    newSceneNameInput.placeholder = 'Yeni sahnenin adı (ör. Depo Girişi)';
    var newScenePhotoFile = document.createElement('input');
    newScenePhotoFile.type = 'file';
    newScenePhotoFile.accept = 'image/*';
    newSceneInfoSection.appendChild(newSceneNameInput);
    newSceneInfoSection.appendChild(newScenePhotoFile);

    var newSceneConnSection = settingsSection('Hangi sahnelere bağlansın? (çift yönlü)', '🔗', true);
    var newSceneConnList = document.createElement('div');
    newSceneConnList.id = 'posFinderNewSceneConnList';
    var newSceneAddConnButton = document.createElement('button');
    newSceneAddConnButton.type = 'button';
    newSceneAddConnButton.id = 'posFinderNewSceneAddConn';
    newSceneAddConnButton.textContent = '+ Bağlantı Ekle';
    newSceneConnSection.appendChild(newSceneConnList);
    newSceneConnSection.appendChild(newSceneAddConnButton);

    function addNewSceneConnRow() {
      var row = document.createElement('div');
      row.className = 'posFinderNewSceneConnRow';
      var sel = document.createElement('select');
      data.scenes.forEach(function(s, i) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
        sel.appendChild(opt);
      });
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'posFinderNewSceneConnRemove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', function() {
        if (newSceneConnList.children.length > 1) newSceneConnList.removeChild(row);
      });
      row.appendChild(sel);
      row.appendChild(removeBtn);
      newSceneConnList.appendChild(row);
    }
    newSceneAddConnButton.addEventListener('click', addNewSceneConnRow);

    var newSceneCreateButton = document.createElement('button');
    newSceneCreateButton.id = 'posFinderNewSceneCreate';
    newSceneCreateButton.textContent = 'Sahneyi Oluştur';

    var newSceneProgressOuter = document.createElement('div');
    newSceneProgressOuter.id = 'posFinderNewSceneProgressOuter';
    var newSceneProgressInner = document.createElement('div');
    newSceneProgressInner.id = 'posFinderNewSceneProgressInner';
    newSceneProgressOuter.appendChild(newSceneProgressInner);
    newSceneProgressOuter.style.display = 'none';

    var newSceneDownloadLink = document.createElement('a');
    newSceneDownloadLink.id = 'posFinderNewSceneDownload';
    newSceneDownloadLink.textContent = 'ZIP dosyasını indir';
    newSceneDownloadLink.style.display = 'none';

    var newSceneStatus = document.createElement('div');
    newSceneStatus.id = 'posFinderNewSceneStatus';
    newSceneStatus.textContent = 'Sahne adını girin, fotoğrafı seçin ve bağlanacağı sahneleri belirtin.';

    newScenePanel.appendChild(newSceneInfoSection._accordionWrapper);
    newScenePanel.appendChild(newSceneConnSection._accordionWrapper);
    newScenePanel.appendChild(newSceneCreateButton);
    newScenePanel.appendChild(newSceneProgressOuter);
    newScenePanel.appendChild(newSceneDownloadLink);
    newScenePanel.appendChild(newSceneStatus);

    function saveNewScenes() { window.localStorage.setItem(NEW_SCENE_KEY, JSON.stringify(newScenes)); updateCount(); }

    newSceneCreateButton.addEventListener('click', function() {
      var name = newSceneNameInput.value.trim();
      var file = newScenePhotoFile.files[0];
      var connSelects = newSceneConnList.querySelectorAll('select');
      var connections = [];
      connSelects.forEach(function(sel) {
        if (sel.value && connections.indexOf(sel.value) === -1) connections.push(sel.value);
      });
      if (!name) { newSceneStatus.textContent = 'Lütfen sahne adı girin.'; return; }
      if (!file) { newSceneStatus.textContent = 'Lütfen bir fotoğraf seçin.'; return; }
      if (!connections.length) { newSceneStatus.textContent = 'Lütfen en az bir bağlantı seçin.'; return; }
      if (!window.EnzaPhotoTool) { newSceneStatus.textContent = 'Araç henüz hazır değil, birkaç saniye bekleyip tekrar deneyin.'; return; }

      var tempId = 'new-' + Date.now();
      newSceneDownloadLink.style.display = 'none';
      newSceneProgressOuter.style.display = 'block';
      newSceneProgressInner.style.width = '0%';
      newSceneStatus.textContent = 'İşleniyor, sayfayı kapatmayın...';
      newSceneCreateButton.disabled = true;

      window.EnzaPhotoTool.buildSceneTiles(file, tempId, function(fraction) {
        newSceneProgressInner.style.width = Math.round(fraction * 100) + '%';
      }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        newSceneDownloadLink.href = url;
        newSceneDownloadLink.download = tempId + '-tiles.zip';
        newSceneDownloadLink.style.display = 'block';
        var record = {
          tempId: tempId,
          name: name,
          connections: connections.map(function(id) {
            var s = findSceneDataById(id);
            return { sceneId: id, sceneName: s ? s.name : id };
          })
        };
        newScenes.push(record);
        saveNewScenes();
        newSceneStatus.textContent = 'Hazır! ZIP\'i indirin, "Kopyala" ile bilgileri kopyalayın ve ikisini de Claude\'a gönderip "yeni sahne ekledim" yazın.';
        newSceneCreateButton.disabled = false;
        pushHistory('yeni sahne oluşturma (' + name + ')', function() {
          newScenes = newScenes.filter(function(r) { return r !== record; });
          saveNewScenes();
        }, function() {
          newScenes.push(record);
          saveNewScenes();
        });
        newSceneNameInput.value = '';
        newScenePhotoFile.value = '';
        newSceneConnList.innerHTML = '';
        addNewSceneConnRow();
      }).catch(function(err) {
        newSceneStatus.textContent = 'Hata: ' + err;
        newSceneCreateButton.disabled = false;
        console.error(err);
      });
    });

    // Product list panel: search across every info-hotspot in every scene, click to jump.
    var listPanel = document.createElement('div');
    listPanel.id = 'posFinderListPanel';
    listPanel.style.display = 'none';

    var listSearchInput = document.createElement('input');
    listSearchInput.type = 'text';
    listSearchInput.id = 'posFinderListSearch';
    listSearchInput.placeholder = 'Ürün veya sahne adına göre ara...';

    var listCategoryRow = document.createElement('div');
    listCategoryRow.id = 'posFinderListCategoryRow';

    var listStatus = document.createElement('div');
    listStatus.id = 'posFinderListStatus';

    var listMoveFlyout = document.createElement('div');
    listMoveFlyout.id = 'posFinderListMoveFlyout';
    listMoveFlyout.style.display = 'none';
    var listMoveFlyoutTitle = document.createElement('div');
    listMoveFlyoutTitle.id = 'posFinderListMoveFlyoutTitle';
    var listMoveSceneSelect = document.createElement('select');
    listMoveSceneSelect.id = 'posFinderListMoveSceneSelect';
    var listMoveFlyoutButtons = document.createElement('div');
    listMoveFlyoutButtons.id = 'posFinderListMoveFlyoutButtons';
    var listMoveGoButton = document.createElement('button');
    listMoveGoButton.type = 'button';
    listMoveGoButton.textContent = 'Sahneye Git ve Konum Seç';
    var listMoveCancelButton = document.createElement('button');
    listMoveCancelButton.type = 'button';
    listMoveCancelButton.textContent = 'İptal';
    listMoveFlyoutButtons.appendChild(listMoveGoButton);
    listMoveFlyoutButtons.appendChild(listMoveCancelButton);
    listMoveFlyout.appendChild(listMoveFlyoutTitle);
    listMoveFlyout.appendChild(listMoveSceneSelect);
    listMoveFlyout.appendChild(listMoveFlyoutButtons);

    var listResults = document.createElement('div');
    listResults.id = 'posFinderListResults';

    listPanel.appendChild(listSearchInput);
    listPanel.appendChild(listCategoryRow);
    listPanel.appendChild(listMoveFlyout);
    listPanel.appendChild(listStatus);
    listPanel.appendChild(listResults);

    var moveFlyoutItem = null;
    function openMoveFlyout(item) {
      moveFlyoutItem = item;
      listMoveFlyoutTitle.textContent = '"' + item.title + '" hangi sahneye taşınsın?';
      listMoveSceneSelect.innerHTML = '';
      data.scenes.forEach(function(s, i) {
        if (s.id === item.sceneId) return;
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
        listMoveSceneSelect.appendChild(opt);
      });
      listMoveFlyout.style.display = 'flex';
    }
    listMoveCancelButton.addEventListener('click', function() {
      moveFlyoutItem = null;
      listMoveFlyout.style.display = 'none';
    });
    listMoveGoButton.addEventListener('click', function() {
      if (!moveFlyoutItem) return;
      var targetId = listMoveSceneSelect.value;
      var targetWrapper = findSceneById(targetId);
      var sourceWrapper = findSceneById(moveFlyoutItem.sceneId);
      if (!targetWrapper || !sourceWrapper) { listMoveFlyout.style.display = 'none'; return; }
      var entry = sourceWrapper.editableHotspots.filter(function(e) {
        return e.kind === 'info' && e.rawData === moveFlyoutItem.hotspot;
      })[0];
      if (!entry) {
        // Product may have already been moved once this session, so its
        // rawData is no longer the same object reference as data.js's copy -
        // fall back to matching by title within the scene it's listed under.
        entry = sourceWrapper.editableHotspots.filter(function(e) {
          return e.kind === 'info' && e.rawData.title === moveFlyoutItem.title;
        })[0];
      }
      listMoveFlyout.style.display = 'none';
      if (!entry) {
        listStatus.textContent = 'Bu ürün bulunamadı (belki zaten taşındı). Sayfayı yenileyip tekrar deneyin.';
        moveFlyoutItem = null;
        return;
      }
      pendingMove = { sourceSceneId: sourceWrapper.data.id, entry: entry, title: moveFlyoutItem.title };
      switchScene(targetWrapper);
      listStatus.textContent = '"' + moveFlyoutItem.title + '" için ' + targetWrapper.data.name.replace(/^\d+\.\s*/, '') + ' sahnesinde yeni konuma tıklayın (Esc: iptal).';
      moveFlyoutItem = null;
    });

    function finalizeMoveHotspot(newYaw, newPitch) {
      if (!pendingMove) return;
      var move = pendingMove;
      pendingMove = null;
      var sourceWrapper = findSceneById(move.sourceSceneId);
      var targetWrapper = currentSceneWrapper;
      if (!sourceWrapper || !targetWrapper || sourceWrapper === targetWrapper) return;
      var idx = sourceWrapper.editableHotspots.indexOf(move.entry);
      if (idx === -1) return;

      var oldYaw = move.entry.rawData.yaw;
      var oldPitch = move.entry.rawData.pitch;
      var title = move.entry.rawData.title;
      var sourceSceneId = sourceWrapper.data.id;
      var sourceSceneName = sourceWrapper.data.name.replace(/^\d+\.\s*/, '');
      var targetSceneId = targetWrapper.data.id;
      var targetSceneName = targetWrapper.data.name.replace(/^\d+\.\s*/, '');

      function relocate(fromWrapper, toWrapper, movingEntry, yaw, pitch) {
        var fi = fromWrapper.editableHotspots.indexOf(movingEntry);
        if (fi !== -1) {
          fromWrapper.scene.hotspotContainer().destroyHotspot(movingEntry.hotspot);
          fromWrapper.editableHotspots.splice(fi, 1);
        }
        var newRawData = {};
        for (var k in movingEntry.rawData) { if (movingEntry.rawData.hasOwnProperty(k)) newRawData[k] = movingEntry.rawData[k]; }
        newRawData.yaw = yaw;
        newRawData.pitch = pitch;
        var el = createInfoHotspotElement(newRawData, toWrapper.data.name);
        var newHotspot = toWrapper.scene.hotspotContainer().createHotspot(el, { yaw: yaw, pitch: pitch });
        var newEntry = { hotspot: newHotspot, kind: 'info', label: movingEntry.label, rawData: newRawData };
        toWrapper.editableHotspots.push(newEntry);
        return newEntry;
      }

      var state = { entry: relocate(sourceWrapper, targetWrapper, move.entry, newYaw, newPitch), wrapper: targetWrapper };

      var beforeSnapshot = settingsChanges.slice();
      settingsChanges.push({
        type: 'moveProduct',
        title: title,
        sourceSceneId: sourceSceneId,
        sourceSceneName: sourceSceneName,
        targetSceneId: targetSceneId,
        targetSceneName: targetSceneName,
        oldYaw: oldYaw,
        oldPitch: oldPitch,
        newYaw: newYaw,
        newPitch: newPitch
      });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      listStatus.textContent = '"' + title + '" -> "' + targetSceneName + '" sahnesine taşındı.';
      renderListResults(listSearchInput.value);

      pushHistory('ürün taşıma (' + title + ')', function() {
        state.entry = relocate(state.wrapper, sourceWrapper, state.entry, oldYaw, oldPitch);
        state.wrapper = sourceWrapper;
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
        listStatus.textContent = '"' + title + '" taşıma geri alındı.';
        renderListResults(listSearchInput.value);
      }, function() {
        state.entry = relocate(state.wrapper, targetWrapper, state.entry, newYaw, newPitch);
        state.wrapper = targetWrapper;
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        listStatus.textContent = '"' + title + '" -> "' + targetSceneName + '" sahnesine taşındı.';
        renderListResults(listSearchInput.value);
      });
    }

    function stripHtml(html) {
      var div = document.createElement('div');
      div.innerHTML = html || '';
      return (div.textContent || div.innerText || '').trim();
    }

    function buildProductIndex() {
      var items = [];
      data.scenes.forEach(function(s, i) {
        (s.infoHotspots || []).forEach(function(h) {
          items.push({
            sceneId: s.id,
            sceneName: (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, ''),
            title: h.title || '(başlıksız)',
            preview: stripHtml(h.text).slice(0, 80),
            hotspot: h
          });
        });
      });
      return items;
    }

    var activeCategoryFilter = null;
    function populateListCategoryRow() {
      if (listCategoryRow.dataset.filled) return;
      var seen = {};
      var categories = [];
      buildProductIndex().forEach(function(item) {
        var roomType = item.sceneName.replace(/^\d+\.\s*/, '');
        if (!seen[roomType]) { seen[roomType] = true; categories.push(roomType); }
      });
      categories.forEach(function(cat) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'posFinderCategoryChip';
        chip.textContent = cat;
        chip.addEventListener('click', function() {
          activeCategoryFilter = (activeCategoryFilter === cat) ? null : cat;
          Array.prototype.forEach.call(listCategoryRow.querySelectorAll('.posFinderCategoryChip'), function(c) {
            c.classList.toggle('active', c.textContent === activeCategoryFilter);
          });
          renderListResults(listSearchInput.value);
        });
        listCategoryRow.appendChild(chip);
      });
      listCategoryRow.dataset.filled = '1';
    }

    function renderListResults(filterText) {
      var items = buildProductIndex();
      if (activeCategoryFilter) {
        items = items.filter(function(item) { return item.sceneName.replace(/^\d+\.\s*/, '') === activeCategoryFilter; });
      }
      var q = (filterText || '').trim().toLocaleLowerCase('tr');
      if (q) {
        items = items.filter(function(item) {
          return item.title.toLocaleLowerCase('tr').indexOf(q) !== -1 ||
                 item.sceneName.toLocaleLowerCase('tr').indexOf(q) !== -1 ||
                 item.preview.toLocaleLowerCase('tr').indexOf(q) !== -1;
        });
      }
      listResults.innerHTML = '';
      if (!items.length) {
        var empty = document.createElement('div');
        empty.id = 'posFinderListEmpty';
        empty.textContent = 'Sonuç bulunamadı.';
        listResults.appendChild(empty);
        return;
      }
      items.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'posFinderListRow';
        var titleEl = document.createElement('div');
        titleEl.className = 'posFinderListRowTitle';
        titleEl.textContent = item.title;
        var sceneEl = document.createElement('div');
        sceneEl.className = 'posFinderListRowScene';
        sceneEl.textContent = item.sceneName;
        row.appendChild(titleEl);
        row.appendChild(sceneEl);
        if (item.preview) {
          var previewEl = document.createElement('div');
          previewEl.className = 'posFinderListRowPreview';
          previewEl.textContent = item.preview;
          row.appendChild(previewEl);
        }
        var moveBtn = document.createElement('button');
        moveBtn.type = 'button';
        moveBtn.className = 'posFinderListMoveButton';
        moveBtn.textContent = '🔀 Taşı';
        moveBtn.title = 'Başka bir sahneye taşı';
        moveBtn.addEventListener('click', function(ev) {
          ev.stopPropagation();
          openMoveFlyout(item);
        });
        row.appendChild(moveBtn);
        row.addEventListener('click', function() {
          var sceneWrapper = findSceneById(item.sceneId);
          if (!sceneWrapper) return;
          switchScene(sceneWrapper);
          sceneWrapper.view.setParameters({ yaw: item.hotspot.yaw, pitch: item.hotspot.pitch });
        });
        listResults.appendChild(row);
      });
    }

    listSearchInput.addEventListener('input', function() {
      renderListResults(listSearchInput.value);
    });

    // Connection map panel: topology diagram of which scenes link to which
    // (scenes placed on a circle in list order — NOT a scaled floor plan).
    var mapPanel = document.createElement('div');
    mapPanel.id = 'posFinderMapPanel';
    mapPanel.style.display = 'none';

    var mapCaption = document.createElement('div');
    mapCaption.id = 'posFinderMapCaption';
    mapCaption.textContent = 'Sahneler arası bağlantı şeması (gerçek ölçekli kat planı değildir). Bir daireye tıklayıp o sahneye gidin.';

    var mapSvgWrapper = document.createElement('div');
    mapSvgWrapper.id = 'posFinderMapSvgWrapper';

    mapPanel.appendChild(mapCaption);
    mapPanel.appendChild(mapSvgWrapper);

    function renderMap() {
      mapSvgWrapper.innerHTML = '';
      var size = 320;
      var center = size / 2;
      var radius = size / 2 - 28;
      var n = data.scenes.length;
      var positions = {};
      data.scenes.forEach(function(s, i) {
        var angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        positions[s.id] = {
          x: center + radius * Math.cos(angle),
          y: center + radius * Math.sin(angle)
        };
      });

      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      svg.setAttribute('width', '100%');
      svg.id = 'posFinderMapSvg';

      var drawn = {};
      data.scenes.forEach(function(s) {
        (s.linkHotspots || []).forEach(function(h) {
          var a = s.id, b = h.target;
          var key = [a, b].sort().join('|');
          if (drawn[key]) return;
          drawn[key] = true;
          var pa = positions[a], pb = positions[b];
          if (!pa || !pb) return;
          var line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', pa.x); line.setAttribute('y1', pa.y);
          line.setAttribute('x2', pb.x); line.setAttribute('y2', pb.y);
          line.setAttribute('class', 'posFinderMapLine');
          svg.appendChild(line);
        });
      });

      data.scenes.forEach(function(s, i) {
        var p = positions[s.id];
        var isCurrent = currentSceneWrapper && currentSceneWrapper.data.id === s.id;
        var g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'posFinderMapNode' + (isCurrent ? ' posFinderMapNodeCurrent' : ''));
        var circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y); circle.setAttribute('r', 12);
        var text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', p.x); text.setAttribute('y', p.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.textContent = String(i + 1);
        var title = document.createElementNS(svgNS, 'title');
        title.textContent = s.name;
        g.appendChild(circle);
        g.appendChild(text);
        g.appendChild(title);
        g.addEventListener('click', function() {
          var sceneWrapper = findSceneById(s.id);
          if (sceneWrapper) switchScene(sceneWrapper);
          renderMap();
        });
        svg.appendChild(g);
      });

      mapSvgWrapper.appendChild(svg);
    }

    // Scene order panel: reorder the sidebar list with up/down buttons.
    var orderPanel = document.createElement('div');
    orderPanel.id = 'posFinderOrderPanel';
    orderPanel.style.display = 'none';

    var orderCaption = document.createElement('div');
    orderCaption.id = 'posFinderOrderCaption';
    orderCaption.textContent = 'Sahnelerin listede görünme sırasını ok tuşlarıyla değiştirin, sonra "Sırayı Kaydet" butonuna basın.';

    var orderList = document.createElement('div');
    orderList.id = 'posFinderOrderList';

    var orderSaveButton = document.createElement('button');
    orderSaveButton.id = 'posFinderOrderSave';
    orderSaveButton.textContent = 'Sırayı Kaydet';

    var orderStatus = document.createElement('div');
    orderStatus.id = 'posFinderOrderStatus';

    orderPanel.appendChild(orderCaption);
    orderPanel.appendChild(orderList);
    orderPanel.appendChild(orderSaveButton);
    orderPanel.appendChild(orderStatus);

    var orderBaseline = data.scenes.slice();

    function reorderSidebarDom() {
      var container = document.querySelector('#sceneList .scenes');
      if (!container) return;
      data.scenes.forEach(function(s) {
        var el = container.querySelector('.scene[data-id="' + s.id + '"]');
        if (el) container.appendChild(el);
      });
    }

    function renderOrderList() {
      orderList.innerHTML = '';
      data.scenes.forEach(function(s, i) {
        var row = document.createElement('div');
        row.className = 'posFinderOrderRow';
        var label = document.createElement('span');
        label.className = 'posFinderOrderRowLabel';
        label.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
        var btnUp = document.createElement('button');
        btnUp.type = 'button';
        btnUp.className = 'posFinderOrderMoveButton';
        btnUp.textContent = '▲';
        btnUp.disabled = i === 0;
        btnUp.addEventListener('click', function() { moveScene(i, -1); });
        var btnDown = document.createElement('button');
        btnDown.type = 'button';
        btnDown.className = 'posFinderOrderMoveButton';
        btnDown.textContent = '▼';
        btnDown.disabled = i === data.scenes.length - 1;
        btnDown.addEventListener('click', function() { moveScene(i, 1); });
        var isHidden = !!hiddenSceneIds[s.id];
        var btnVisibility = document.createElement('button');
        btnVisibility.type = 'button';
        btnVisibility.className = 'posFinderOrderMoveButton' + (isHidden ? ' posFinderOrderHiddenActive' : '');
        btnVisibility.textContent = isHidden ? '🙈' : '👁';
        btnVisibility.title = isHidden ? 'Sahneyi tekrar göster' : 'Sahneyi geçici gizle (bakımda)';
        btnVisibility.addEventListener('click', function() { toggleSceneVisibility(s.id); });
        var btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'posFinderOrderMoveButton posFinderOrderDeleteButton';
        btnDelete.textContent = '🗑';
        btnDelete.title = 'Sahneyi sil';
        btnDelete.addEventListener('click', function() { deleteScene(s.id); });
        if (isHidden) row.classList.add('posFinderOrderRowHidden');
        row.appendChild(label);
        row.appendChild(btnUp);
        row.appendChild(btnDown);
        row.appendChild(btnVisibility);
        row.appendChild(btnDelete);
        orderList.appendChild(row);
      });
    }

    function deleteScene(sceneId) {
      var index = data.scenes.findIndex(function(s) { return s.id === sceneId; });
      if (index === -1) return;
      var sceneObj = data.scenes[index];
      var sceneName = sceneObj.name.replace(/^\d+\.\s*/, '');
      if (!window.confirm('"' + sceneName + '" sahnesi silinsin mi? Bu sahneye giden oklar da site canlıya alınırken kaldırılacak.')) return;

      var container = document.querySelector('#sceneList .scenes');
      var domEl = container ? container.querySelector('.scene[data-id="' + sceneId + '"]') : null;
      var domNextSibling = domEl ? domEl.nextSibling : null;
      var beforeSnapshot = settingsChanges.slice();

      function applyDelete() {
        var curIndex = data.scenes.findIndex(function(s) { return s.id === sceneId; });
        if (curIndex !== -1) data.scenes.splice(curIndex, 1);
        orderBaseline = orderBaseline.filter(function(s) { return s.id !== sceneId; });
        if (domEl && domEl.parentNode) domEl.parentNode.removeChild(domEl);
        renderOrderList();
        settingsChanges.push({ type: 'deleteScene', sceneId: sceneId, sceneName: sceneName });
        saveSettingsChanges();
        orderStatus.textContent = '"' + sceneName + '" silindi (henüz canlı sitede değil, kaydedip Claude\'a gönderince uygulanacak).';
      }

      applyDelete();

      pushHistory('sahne silme (' + sceneName + ')', function() {
        data.scenes.splice(index, 0, sceneObj);
        orderBaseline = data.scenes.slice();
        if (domEl && container) container.insertBefore(domEl, domNextSibling);
        renderOrderList();
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
        orderStatus.textContent = '"' + sceneName + '" geri getirildi.';
      }, function() {
        applyDelete();
      });
    }

    function toggleSceneVisibility(sceneId) {
      var sceneObj = data.scenes.filter(function(s) { return s.id === sceneId; })[0];
      if (!sceneObj) return;
      var sceneName = sceneObj.name.replace(/^\d+\.\s*/, '');
      var wasHidden = !!hiddenSceneIds[sceneId];
      var nowHidden = !wasHidden;
      var beforeSnapshot = settingsChanges.slice();

      function applyVisibility(hidden) {
        if (hidden) { hiddenSceneIds[sceneId] = true; } else { delete hiddenSceneIds[sceneId]; }
        applySceneVisibilityToDom(sceneId, hidden);
        renderOrderList();
        settingsChanges = settingsChanges.filter(function(c) { return !(c.type === 'sceneVisibility' && c.sceneId === sceneId); });
        settingsChanges.push({ type: 'sceneVisibility', sceneId: sceneId, hidden: hidden, sceneName: sceneName });
        saveSettingsChanges();
        orderStatus.textContent = hidden
          ? '"' + sceneName + '" geçici olarak gizlendi (bakımda).'
          : '"' + sceneName + '" tekrar görünür yapıldı.';
      }

      applyVisibility(nowHidden);
      var afterSnapshot = settingsChanges.slice();

      pushHistory(nowHidden ? ('sahne gizleme (' + sceneName + ')') : ('sahne gösterme (' + sceneName + ')'), function() {
        if (wasHidden) { hiddenSceneIds[sceneId] = true; } else { delete hiddenSceneIds[sceneId]; }
        applySceneVisibilityToDom(sceneId, wasHidden);
        renderOrderList();
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
        orderStatus.textContent = '"' + sceneName + '" görünürlüğü geri alındı.';
      }, function() {
        if (nowHidden) { hiddenSceneIds[sceneId] = true; } else { delete hiddenSceneIds[sceneId]; }
        applySceneVisibilityToDom(sceneId, nowHidden);
        renderOrderList();
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        orderStatus.textContent = nowHidden
          ? '"' + sceneName + '" geçici olarak gizlendi (bakımda).'
          : '"' + sceneName + '" tekrar görünür yapıldı.';
      });
    }

    function moveScene(index, delta) {
      var newIndex = index + delta;
      if (newIndex < 0 || newIndex >= data.scenes.length) return;
      var tmp = data.scenes[index];
      data.scenes[index] = data.scenes[newIndex];
      data.scenes[newIndex] = tmp;
      reorderSidebarDom();
      renderOrderList();
      orderStatus.textContent = 'Sıralama değişti (henüz kaydedilmedi).';
    }

    orderSaveButton.addEventListener('click', function() {
      var beforeSnapshot = settingsChanges.slice();
      var beforeOrder = orderBaseline.slice();
      var afterOrder = data.scenes.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'sceneOrder'; });
      var newOrder = afterOrder.map(function(s) { return s.id; });
      settingsChanges.push({ type: 'sceneOrder', order: newOrder });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      orderBaseline = data.scenes.slice();
      orderStatus.textContent = 'Yeni sıralama kaydedildi.';
      pushHistory('sahne sırası değiştirme', function() {
        data.scenes = beforeOrder;
        orderBaseline = beforeOrder.slice();
        reorderSidebarDom();
        renderOrderList();
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        data.scenes = afterOrder;
        orderBaseline = afterOrder.slice();
        reorderSidebarDom();
        renderOrderList();
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        orderStatus.textContent = 'Yeni sıralama kaydedildi.';
      });
    });

    // Header: drag handle + minimize toggle, so the box can be moved out of
    // the way and collapsed to a small pill instead of always taking up
    // this much space with every tool visible at once.
    var header = document.createElement('div');
    header.id = 'posFinderHeader';
    var headerTitle = document.createElement('span');
    headerTitle.id = 'posFinderHeaderTitle';
    headerTitle.textContent = 'Yönetim Paneli';
    var fontSizeButton = document.createElement('button');
    fontSizeButton.type = 'button';
    fontSizeButton.id = 'posFinderFontSize';
    fontSizeButton.textContent = 'Aa';
    fontSizeButton.title = 'Yazı boyutu';
    var minimizeButton = document.createElement('button');
    minimizeButton.type = 'button';
    minimizeButton.id = 'posFinderMinimize';
    minimizeButton.textContent = '–';
    minimizeButton.title = 'Küçült';
    header.appendChild(headerTitle);
    header.appendChild(fontSizeButton);
    header.appendChild(minimizeButton);

    // Admin panel's own text size (accessibility, e.g. for reading on a
    // phone) - purely a local preference for this browser, cycles through
    // three sizes and remembers the choice.
    (function setupAdminFontSize() {
      var FONT_SIZE_KEY = 'enzaAdminFontSize';
      var SIZES = ['normal', 'large', 'xlarge'];
      var stored = null;
      try { stored = window.localStorage.getItem(FONT_SIZE_KEY); } catch (e) {}
      var current = SIZES.indexOf(stored) !== -1 ? stored : 'normal';
      function apply(size) {
        current = size;
        box.classList.remove('posFinderTextLarge', 'posFinderTextXLarge');
        if (size === 'large') box.classList.add('posFinderTextLarge');
        if (size === 'xlarge') box.classList.add('posFinderTextXLarge');
        try { window.localStorage.setItem(FONT_SIZE_KEY, size); } catch (e) {}
      }
      apply(current);
      fontSizeButton.addEventListener('click', function() {
        var idx = SIZES.indexOf(current);
        apply(SIZES[(idx + 1) % SIZES.length]);
      });
    })();

    // Category tabs group the 9 tools into 4 topics so they aren't all
    // fighting for attention in one flat row. Switching category shows only
    // that group's buttons in modeRow and jumps to its first mode.
    var categoryRow = document.createElement('div');
    categoryRow.id = 'posFinderCategoryRow';
    var categories = [
      { key: 'edit', label: 'Düzenle', buttons: [productModeButton, linkModeButton, deleteModeButton] },
      { key: 'scenes', label: 'Sahneler', buttons: [newSceneModeButton, orderModeButton, mapModeButton] },
      { key: 'content', label: 'İçerik', buttons: [listModeButton, photoModeButton] },
      { key: 'settings', label: 'Ayarlar', buttons: [settingsModeButton] }
    ];
    var categoryButtons = {};
    categories.forEach(function(cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'posFinderCategoryButton';
      btn.textContent = cat.label;
      btn.addEventListener('click', function() { showCategory(cat.key); });
      categoryRow.appendChild(btn);
      categoryButtons[cat.key] = btn;
    });

    function showCategory(key) {
      categories.forEach(function(cat) {
        categoryButtons[cat.key].classList.toggle('active', cat.key === key);
        cat.buttons.forEach(function(btn) {
          btn.style.display = (cat.key === key) ? '' : 'none';
        });
      });
      var activeCat = categories.filter(function(c) { return c.key === key; })[0];
      if (activeCat && activeCat.buttons.length) activeCat.buttons[0].click();
    }

    var content = document.createElement('div');
    content.id = 'posFinderContent';
    content.appendChild(modeRow);
    content.appendChild(coordsLine);
    content.appendChild(inputRow);
    content.appendChild(badgeRow);
    content.appendChild(descRow);
    content.appendChild(photoPanel);
    content.appendChild(settingsPanel);
    content.appendChild(newScenePanel);
    content.appendChild(listPanel);
    content.appendChild(mapPanel);
    content.appendChild(orderPanel);
    content.appendChild(actionRow);

    box.appendChild(header);
    box.appendChild(categoryRow);
    box.appendChild(content);
    document.body.appendChild(box);

    showCategory('edit');

    minimizeButton.addEventListener('click', function() {
      var collapsed = box.classList.toggle('posFinderCollapsed');
      minimizeButton.textContent = collapsed ? '+' : '–';
      minimizeButton.title = collapsed ? 'Genişlet' : 'Küçült';
    });

    // Drag the whole box by its header, same pattern as the contact bar drag.
    (function setupBoxDrag() {
      var dragging = null;
      header.addEventListener('pointerdown', function(event) {
        if (event.target === minimizeButton) return;
        var rect = box.getBoundingClientRect();
        dragging = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          boxLeft: rect.left,
          boxTop: rect.top,
          moved: false
        };
      });
      window.addEventListener('pointermove', function(event) {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        var dx = event.clientX - dragging.startX;
        var dy = event.clientY - dragging.startY;
        if (!dragging.moved && Math.sqrt(dx * dx + dy * dy) < 6) return;
        dragging.moved = true;
        box.style.bottom = 'auto';
        box.style.transform = 'none';
        box.style.left = Math.max(0, dragging.boxLeft + dx) + 'px';
        box.style.top = Math.max(0, dragging.boxTop + dy) + 'px';
      });
      window.addEventListener('pointerup', function(event) {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        dragging = null;
      });
    })();

    function resetInputRowForAdd() {
      editingEntry = null;
      addButton.textContent = 'Ekle';
      linkInput.value = '';
      badgeRow.style.display = 'none';
      descRow.style.display = 'none';
      descTextarea.value = '';
    }

    function setMode(newMode) {
      mode = newMode;
      productModeButton.classList.toggle('active', mode === 'product');
      linkModeButton.classList.toggle('active', mode === 'link');
      deleteModeButton.classList.toggle('active', mode === 'delete');
      photoModeButton.classList.toggle('active', mode === 'photo');
      settingsModeButton.classList.toggle('active', mode === 'settings');
      newSceneModeButton.classList.toggle('active', mode === 'newScene');
      listModeButton.classList.toggle('active', mode === 'list');
      mapModeButton.classList.toggle('active', mode === 'map');
      orderModeButton.classList.toggle('active', mode === 'order');
      linkInput.style.display = mode === 'product' ? '' : 'none';
      sceneSelect.style.display = mode === 'link' ? '' : 'none';
      inputRow.style.display = (mode === 'delete' || mode === 'photo' || mode === 'settings' || mode === 'newScene' || mode === 'list' || mode === 'map' || mode === 'order') ? 'none' : 'flex';
      photoPanel.style.display = mode === 'photo' ? 'block' : 'none';
      settingsPanel.style.display = mode === 'settings' ? 'block' : 'none';
      newScenePanel.style.display = mode === 'newScene' ? 'block' : 'none';
      listPanel.style.display = mode === 'list' ? 'block' : 'none';
      mapPanel.style.display = mode === 'map' ? 'block' : 'none';
      orderPanel.style.display = mode === 'order' ? 'block' : 'none';
      actionRow.style.display = (mode === 'photo' || mode === 'settings' || mode === 'newScene' || mode === 'list' || mode === 'map' || mode === 'order') ? 'none' : 'flex';
      coordsLine.style.display = (mode === 'photo' || mode === 'settings' || mode === 'newScene' || mode === 'list' || mode === 'map' || mode === 'order') ? 'none' : '';
      pendingCoords = null;
      resetInputRowForAdd();
      coordsLine.classList.remove('ready');
      if (mode === 'product') coordsLine.textContent = 'Boş bir yere tıklayın (yeni ürün) veya var olan bir baloncuğa tıklayın (düzenle)';
      else if (mode === 'link') coordsLine.textContent = 'Ok başlayacağı yere tıklayın (yeni ok) veya var olan bir oka tıklayın (düzenle)';
      else if (mode === 'delete') coordsLine.textContent = 'Silmek istediğiniz ikona dokunun';
      if (mode === 'photo') populatePhotoSceneSelect();
      if (mode === 'settings') populateSettingsPanel();
      if (mode === 'newScene' && !newSceneConnList.children.length) addNewSceneConnRow();
      if (mode === 'list') { populateListCategoryRow(); renderListResults(listSearchInput.value); }
      if (mode === 'map') renderMap();
      if (mode === 'order') renderOrderList();
      if (mode !== 'settings') {
        showCampaignBanner(getEffectiveCampaignText());
        document.documentElement.style.setProperty('--hotspot-icon-scale', String(getEffectiveHotspotScale()));
      }
    }
    productModeButton.addEventListener('click', function() { setMode('product'); });
    linkModeButton.addEventListener('click', function() { setMode('link'); });
    deleteModeButton.addEventListener('click', function() { setMode('delete'); });
    photoModeButton.addEventListener('click', function() { setMode('photo'); });
    settingsModeButton.addEventListener('click', function() { setMode('settings'); });
    newSceneModeButton.addEventListener('click', function() { setMode('newScene'); });
    listModeButton.addEventListener('click', function() { setMode('list'); });
    mapModeButton.addEventListener('click', function() { setMode('map'); });
    orderModeButton.addEventListener('click', function() { setMode('order'); });

    function populateSceneSelect() {
      sceneSelect.innerHTML = '';
      data.scenes.forEach(function(s, i) {
        if (!currentSceneWrapper || s.id === currentSceneWrapper.data.id) return;
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
        sceneSelect.appendChild(opt);
      });
    }

    function populatePhotoSceneSelect() {
      if (photoSceneSelect.options.length) return; // populate once
      data.scenes.forEach(function(s, i) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
        if (currentSceneWrapper && s.id === currentSceneWrapper.data.id) opt.selected = true;
        photoSceneSelect.appendChild(opt);
      });
    }

    function populateSettingsPanel() {
      populatePresentationList();
      if (!renameSceneSelect.options.length) {
        data.scenes.forEach(function(s, i) {
          var opt1 = document.createElement('option');
          opt1.value = s.id;
          opt1.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
          renameSceneSelect.appendChild(opt1);
          var opt2 = opt1.cloneNode(true);
          startSceneSelect.appendChild(opt2);
          var opt3 = opt1.cloneNode(true);
          notesSceneSelect.appendChild(opt3);
        });
        renameSceneSelect.addEventListener('change', function() {
          var s = findSceneDataById(renameSceneSelect.value);
          renameInput.value = s ? s.name.replace(/^\d+\.\s*/, '') : '';
        });
        renameSceneSelect.dispatchEvent(new Event('change'));
        notesSceneSelect.dispatchEvent(new Event('change'));
      }
      if (!phone1Input.dataset.filled) {
        var phoneLinks = document.querySelectorAll('#sceneListFooter .contactLink[href^="tel:"]');
        if (phoneLinks[0]) phone1Input.value = phoneLinks[0].textContent.trim();
        if (phoneLinks[1]) phone2Input.value = phoneLinks[1].textContent.trim();
        var igLink = document.querySelector('#sceneListFooter .contactLink[href*="instagram.com"]');
        if (igLink) instagramInput.value = igLink.href.replace(/\/$/, '').split('/').pop();
        var mapsLink = document.querySelector('#sceneListFooter .contactLink[href*="maps.google.com"]');
        if (mapsLink) mapsInput.value = mapsLink.href;
        phone1Input.dataset.filled = '1';
      }
      if (!kioskIntervalInput.dataset.filled) {
        kioskIntervalInput.value = (data.settings && data.settings.kioskIntervalSeconds) || 8;
        kioskIntervalInput.dataset.filled = '1';
      }
      if (!tukendiCheckbox.dataset.filled) {
        tukendiCheckbox.checked = !!(data.settings && data.settings.tukendiNotifyEnabled);
        tukendiCheckbox.dataset.filled = '1';
      }
      if (!campaignInput.dataset.filled) {
        campaignInput.value = (data.settings && data.settings.campaignText) || '';
        campaignInput.dataset.filled = '1';
      }
      if (!seasonalSelect.dataset.filled) {
        seasonalSelect.value = (data.settings && data.settings.seasonalEffect) || 'none';
        seasonalSelect.dataset.filled = '1';
      }
      if (!hotspotScaleRow.dataset.filled) {
        var currentScaleValue = (data.settings && data.settings.hotspotIconScale) || 1;
        var matchedScale = HOTSPOT_SCALE_OPTIONS.filter(function(o) { return o.value === currentScaleValue; })[0] || HOTSPOT_SCALE_OPTIONS[1];
        selectedHotspotScale = matchedScale;
        Object.keys(hotspotScaleButtonsByKey).forEach(function(k) {
          hotspotScaleButtonsByKey[k].classList.toggle('active', k === matchedScale.key);
        });
        hotspotScaleRow.dataset.filled = '1';
      }
      if (!musicCheckbox.dataset.filled) {
        musicCheckbox.checked = !!(data.settings && data.settings.backgroundMusicEnabled);
        musicCheckbox.dataset.filled = '1';
      }
      if (!featuredSelect.dataset.filled) {
        buildProductIndex().forEach(function(item) {
          var opt = document.createElement('option');
          opt.value = item.title;
          opt.textContent = item.title + ' (' + item.sceneName + ')';
          featuredSelect.appendChild(opt);
        });
        featuredCheckbox.checked = !!(data.settings && data.settings.featuredProductEnabled);
        dailyPickCheckbox.checked = !!(data.settings && data.settings.featuredDailyPick);
        featuredSelect.disabled = dailyPickCheckbox.checked;
        if (data.settings && data.settings.featuredProductTitle) featuredSelect.value = data.settings.featuredProductTitle;
        featuredSelect.dataset.filled = '1';
      }
      if (!transitionButtonsRow.dataset.filled) {
        var currentDuration = (data.settings && data.settings.sceneTransitionDuration != null) ? data.settings.sceneTransitionDuration : 1000;
        var matched = TRANSITION_PRESETS.filter(function(p) { return p.duration === currentDuration; })[0] || TRANSITION_PRESETS[0];
        selectedTransitionPreset = matched;
        Object.keys(transitionButtonsByKey).forEach(function(k) {
          transitionButtonsByKey[k].classList.toggle('active', k === matched.key);
        });
        transitionButtonsRow.dataset.filled = '1';
      }
    }

    function saveEdits() { window.localStorage.setItem(EDIT_KEY, JSON.stringify(edits)); updateCount(); }
    function saveSettingsChanges() { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsChanges)); updateCount(); }

    renameButton.addEventListener('click', function() {
      var sceneId = renameSceneSelect.value;
      var newName = renameInput.value.trim();
      if (!sceneId || !newName) return;
      var s = findSceneDataById(sceneId);
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges.push({ type: 'rename', sceneId: sceneId, oldName: s ? s.name : sceneId, newName: newName });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = 'Kaydedildi: ' + sceneId + ' -> "' + newName + '"';
      pushHistory('sahne adı değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'Kaydedildi: ' + sceneId + ' -> "' + newName + '"';
      });
    });

    startButton.addEventListener('click', function() {
      var sceneId = startSceneSelect.value;
      if (!sceneId) return;
      var s = findSceneDataById(sceneId);
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'startScene'; });
      settingsChanges.push({ type: 'startScene', sceneId: sceneId, sceneName: s ? s.name : sceneId });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      settingsStatus.textContent = 'Varsayılan açılış sahnesi: ' + (s ? s.name : sceneId);
      pushHistory('varsayılan sahne değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'Varsayılan açılış sahnesi: ' + (s ? s.name : sceneId);
      });
    });

    contactButton.addEventListener('click', function() {
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'contact'; });
      settingsChanges.push({
        type: 'contact',
        phone1: phone1Input.value.trim(),
        phone2: phone2Input.value.trim(),
        instagram: instagramInput.value.trim(),
        mapsLink: mapsInput.value.trim()
      });
      var afterSnapshot = settingsChanges.slice();
      saveSettingsChanges();
      pushHistory('iletişim bilgisi değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      }, function() {
        settingsChanges = afterSnapshot;
        saveSettingsChanges();
        settingsStatus.textContent = 'İletişim bilgileri güncellemesi kaydedildi.';
      });
      settingsStatus.textContent = 'İletişim bilgileri güncellemesi kaydedildi.';
    });

    function updatePhotoToolReadyState() {
      var ready = document.body.classList.contains('photo-tool-ready');
      photoFileInput.disabled = !ready;
      photoStatus.textContent = ready ? 'Bir sahne seçin, sonra fotoğrafı seçin.' : 'Kütüphaneler yükleniyor...';
    }

    photoFileInput.addEventListener('change', function() {
      var file = photoFileInput.files[0];
      if (!file || !window.EnzaPhotoTool) return;
      var sceneId = photoSceneSelect.value;
      photoDownloadLink.style.display = 'none';
      photoProgressOuter.style.display = 'block';
      photoProgressInner.style.width = '0%';
      photoStatus.textContent = 'İşleniyor, sayfayı kapatmayın...';
      photoFileInput.disabled = true;

      window.EnzaPhotoTool.buildSceneTiles(file, sceneId, function(fraction) {
        photoProgressInner.style.width = Math.round(fraction * 100) + '%';
      }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        photoDownloadLink.href = url;
        photoDownloadLink.download = sceneId + '-tiles.zip';
        photoDownloadLink.style.display = 'block';
        photoStatus.textContent = 'Hazır! ZIP\'i indirin, Claude\'a "' + sceneId + ' sahnesinin fotoğrafını değiştirdim" diye yazıp dosyayı gönderin.';
        photoFileInput.disabled = false;
      }).catch(function(err) {
        photoStatus.textContent = 'Hata: ' + err;
        photoFileInput.disabled = false;
        console.error(err);
      });
    });

    document.addEventListener('enzaPhotoToolReady', updatePhotoToolReadyState);
    updatePhotoToolReadyState();

    setupContactBarDrag();

    function setupContactBarDrag() {
      var bar = document.querySelector('#contactBar');
      if (!bar) return;
      var dragging = null;
      var suppressBarClick = false;
      var DRAG_THRESHOLD = 6;

      bar.addEventListener('pointerdown', function(event) {
        var rect = bar.getBoundingClientRect();
        dragging = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          barLeft: rect.left,
          barTop: rect.top,
          moved: false,
          originalLeft: bar.style.left,
          originalTop: bar.style.top,
          originalRight: bar.style.right,
          originalBottom: bar.style.bottom
        };
      }, true);

      window.addEventListener('pointermove', function(event) {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        var dx = event.clientX - dragging.startX;
        var dy = event.clientY - dragging.startY;
        if (!dragging.moved && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        dragging.moved = true;
        bar.style.right = 'auto';
        bar.style.bottom = 'auto';
        bar.style.left = Math.max(0, dragging.barLeft + dx) + 'px';
        bar.style.top = Math.max(0, dragging.barTop + dy) + 'px';
      });

      window.addEventListener('pointerup', function(event) {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        if (dragging.moved) {
          var rect = bar.getBoundingClientRect();
          var right = Math.round(window.innerWidth - rect.right);
          var bottom = Math.round(window.innerHeight - rect.bottom);
          var beforeSnapshot = settingsChanges.slice();
          var undoStyle = {
            left: dragging.originalLeft,
            top: dragging.originalTop,
            right: dragging.originalRight,
            bottom: dragging.originalBottom
          };
          var redoStyle = {
            left: bar.style.left,
            top: bar.style.top,
            right: bar.style.right,
            bottom: bar.style.bottom
          };
          settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'contactBarPosition'; });
          settingsChanges.push({ type: 'contactBarPosition', right: right, bottom: bottom });
          var afterSnapshot = settingsChanges.slice();
          saveSettingsChanges();
          settingsStatus.textContent = 'İletişim ikon grubunun yeni konumu kaydedildi (right:' + right + 'px, bottom:' + bottom + 'px).';
          coordsLine.textContent = 'İletişim ikon grubu taşındı ve kaydedildi.';
          suppressBarClick = true;
          pushHistory('iletişim çubuğu taşıma', function() {
            bar.style.left = undoStyle.left;
            bar.style.top = undoStyle.top;
            bar.style.right = undoStyle.right;
            bar.style.bottom = undoStyle.bottom;
            settingsChanges = beforeSnapshot;
            saveSettingsChanges();
          }, function() {
            bar.style.left = redoStyle.left;
            bar.style.top = redoStyle.top;
            bar.style.right = redoStyle.right;
            bar.style.bottom = redoStyle.bottom;
            settingsChanges = afterSnapshot;
            saveSettingsChanges();
          });
        }
        dragging = null;
      });

      bar.addEventListener('click', function(event) {
        if (suppressBarClick) {
          suppressBarClick = false;
          event.stopPropagation();
          event.preventDefault();
        }
      }, true);
    }

    function updateCount() {
      countLabel.textContent = entries.length + ' ürün, ' + arrows.length + ' yeni ok, ' +
        moves.length + ' taşındı, ' + removals.length + ' silindi, ' +
        edits.length + ' düzenlendi, ' + settingsChanges.length + ' ayar, ' +
        newScenes.length + ' yeni sahne';
    }

    function saveEntries() { window.localStorage.setItem(ADD_KEY, JSON.stringify(entries)); updateCount(); }
    function saveMoves() { window.localStorage.setItem(MOVE_KEY, JSON.stringify(moves)); updateCount(); }
    function saveRemovals() { window.localStorage.setItem(REMOVE_KEY, JSON.stringify(removals)); updateCount(); }
    function saveArrows() { window.localStorage.setItem(ARROW_KEY, JSON.stringify(arrows)); updateCount(); }

    function addEntry() {
      var link = linkInput.value.trim();
      if (!pendingCoords || !link) return;
      var record = {
        scene: pendingCoords.scene,
        yaw: pendingCoords.yaw,
        pitch: pendingCoords.pitch,
        link: link
      };
      entries.push(record);
      saveEntries();
      linkInput.value = '';
      pendingCoords = null;
      coordsLine.textContent = 'Eklendi. Bir sonraki ürüne tıklayın...';
      coordsLine.classList.remove('ready');
      pushHistory('ürün ekleme', function() {
        entries = entries.filter(function(e) { return e !== record; });
        saveEntries();
      }, function() {
        entries.push(record);
        saveEntries();
      });
    }

    function addArrow() {
      var targetId = sceneSelect.value;
      if (!pendingCoords || !targetId || !currentSceneWrapper) return;
      var targetData = findSceneDataById(targetId);
      var hotspotData = { yaw: pendingCoords.yaw, pitch: pendingCoords.pitch, rotation: 0, target: targetId };
      var hsElement = createLinkHotspotElement(hotspotData);
      var marzipanoHotspot = currentSceneWrapper.scene.hotspotContainer().createHotspot(hsElement, {
        yaw: pendingCoords.yaw, pitch: pendingCoords.pitch
      });
      var arrowRecord = {
        scene: pendingCoords.scene,
        yaw: pendingCoords.yaw,
        pitch: pendingCoords.pitch,
        targetScene: targetId,
        targetName: targetData ? targetData.name : targetId
      };
      var newEditable = {
        hotspot: marzipanoHotspot,
        kind: 'link',
        label: 'Yön oku → ' + targetId,
        ownRecord: arrowRecord // if dragged, update this record instead of logging a separate move
      };
      var sceneWrapperForUndo = currentSceneWrapper;
      sceneWrapperForUndo.editableHotspots.push(newEditable);
      arrows.push(arrowRecord);
      saveArrows();
      pendingCoords = null;
      coordsLine.textContent = 'Ok eklendi (' + targetData.name + '). Şimdi sürükleyip tam yerine koyabilirsiniz.';
      coordsLine.classList.remove('ready');
      pushHistory('yön oku ekleme', function() {
        sceneWrapperForUndo.scene.hotspotContainer().destroyHotspot(marzipanoHotspot);
        sceneWrapperForUndo.editableHotspots = sceneWrapperForUndo.editableHotspots.filter(function(e) { return e !== newEditable; });
        arrows = arrows.filter(function(a) { return a !== arrowRecord; });
        saveArrows();
      }, function() {
        var redoElement = createLinkHotspotElement(hotspotData);
        marzipanoHotspot = sceneWrapperForUndo.scene.hotspotContainer().createHotspot(redoElement, {
          yaw: hotspotData.yaw, pitch: hotspotData.pitch
        });
        newEditable.hotspot = marzipanoHotspot;
        sceneWrapperForUndo.editableHotspots.push(newEditable);
        arrows.push(arrowRecord);
        saveArrows();
      });
    }

    function saveEdit() {
      if (!editingEntry) return;
      if (editingEntry.kind === 'info') {
        var newLink = linkInput.value.trim();
        var oldSourceLink = editingEntry.rawData.sourceLink;
        var linkChanged = !!newLink && newLink !== oldSourceLink;
        var oldDescHtml = editingEntry.rawData.text;
        var newDescInner = descTextarea.value;
        var oldDescInner = extractDescFromHtml(oldDescHtml);
        var descChanged = newDescInner !== oldDescInner;
        if (!linkChanged && !descChanged) return;
        var newDescHtml = descChanged ? rebuildDescHtml(oldDescHtml, newDescInner) : oldDescHtml;
        var editRecord = {
          scene: currentSceneNumber,
          kind: 'info',
          oldTitle: editingEntry.rawData.title,
          newLink: linkChanged ? newLink : undefined,
          descChanged: descChanged,
          newDescHtml: descChanged ? newDescHtml : undefined
        };
        edits.push(editRecord);
        saveEdits();
        // Live-remembered so re-opening this product for editing later in the
        // same session prefills the link/description instead of starting blank.
        if (linkChanged) editingEntry.rawData.sourceLink = newLink;
        if (descChanged) {
          editingEntry.rawData.text = newDescHtml;
          var descEl = editingEntry.hotspot.domElement().querySelector('.info-hotspot-text');
          if (descEl) descEl.innerHTML = newDescHtml;
        }
        coordsLine.textContent = 'Düzenleme kaydedildi: ' + editingEntry.rawData.title +
          (linkChanged && descChanged ? ' -> link ve açıklama güncellendi' : linkChanged ? ' -> yeni link' : ' -> açıklama güncellendi');
        var editedInfoEntryRef = editingEntry;
        pushHistory('ürün düzenleme', function() {
          edits = edits.filter(function(e) { return e !== editRecord; });
          saveEdits();
          if (linkChanged) editedInfoEntryRef.rawData.sourceLink = oldSourceLink;
          if (descChanged) {
            editedInfoEntryRef.rawData.text = oldDescHtml;
            var revertEl = editedInfoEntryRef.hotspot.domElement().querySelector('.info-hotspot-text');
            if (revertEl) revertEl.innerHTML = oldDescHtml;
          }
        }, function() {
          edits.push(editRecord);
          saveEdits();
          if (linkChanged) editedInfoEntryRef.rawData.sourceLink = newLink;
          if (descChanged) {
            editedInfoEntryRef.rawData.text = newDescHtml;
            var redoEl = editedInfoEntryRef.hotspot.domElement().querySelector('.info-hotspot-text');
            if (redoEl) redoEl.innerHTML = newDescHtml;
          }
        });
      } else if (editingEntry.kind === 'link') {
        var newTargetId = sceneSelect.value;
        if (!newTargetId) return;
        var newTargetData = findSceneDataById(newTargetId);
        var oldTargetId = editingEntry.rawData.target;
        var oldLabel = editingEntry.label;
        var linkEditRecord = {
          scene: currentSceneNumber,
          kind: 'link',
          oldTarget: oldTargetId,
          newTarget: newTargetId,
          newTargetName: newTargetData ? newTargetData.name : newTargetId
        };
        edits.push(linkEditRecord);
        saveEdits();
        // Live-update: the click handler reads hotspot.target fresh each time,
        // so mutating the same object updates the arrow's behavior immediately.
        editingEntry.rawData.target = newTargetId;
        editingEntry.label = 'Yön oku → ' + newTargetId;
        coordsLine.textContent = 'Düzenleme kaydedildi: artık ' + (newTargetData ? newTargetData.name : newTargetId) + ' sahnesine gidiyor';
        var editedEntryRef = editingEntry;
        pushHistory('ok hedefi düzenleme', function() {
          edits = edits.filter(function(e) { return e !== linkEditRecord; });
          saveEdits();
          editedEntryRef.rawData.target = oldTargetId;
          editedEntryRef.label = oldLabel;
        }, function() {
          edits.push(linkEditRecord);
          saveEdits();
          editedEntryRef.rawData.target = newTargetId;
          editedEntryRef.label = 'Yön oku → ' + newTargetId;
        });
      }
      resetInputRowForAdd();
    }

    // Click on empty pano space: start adding a new product hotspot or arrow.
    // Registered on the capture phase so a post-drag click can be cancelled
    // here before it ever reaches a hotspot's own navigate/open handler.
    element.addEventListener('click', function(event) {
      if (suppressNextClick) {
        suppressNextClick = false;
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      if (pendingMove) {
        event.stopPropagation();
        event.preventDefault();
        if (!currentView || !currentView.screenToCoordinates) { pendingMove = null; return; }
        var moveRect = element.getBoundingClientRect();
        var moveCoords = currentView.screenToCoordinates({
          x: event.clientX - moveRect.left,
          y: event.clientY - moveRect.top
        });
        finalizeMoveHotspot(moveCoords.yaw, moveCoords.pitch);
        return;
      }
      var clickedHotspotEl = event.target.closest && event.target.closest('.hotspot');
      if (clickedHotspotEl) {
        if ((mode === 'product' || mode === 'link') && currentSceneWrapper) {
          var editMatch = currentSceneWrapper.editableHotspots.filter(function(entry) {
            return entry.hotspot.domElement() === clickedHotspotEl;
          })[0];
          // Only offer editing for a hotspot of the kind this mode deals with.
          if (editMatch && ((mode === 'product' && editMatch.kind === 'info') ||
                             (mode === 'link' && editMatch.kind === 'link'))) {
            event.stopPropagation();
            event.preventDefault();
            editingEntry = editMatch;
            pendingCoords = null;
            addButton.textContent = 'Güncelle';
            if (mode === 'product') {
              linkInput.value = editMatch.rawData.sourceLink || '';
              coordsLine.textContent = editMatch.rawData.sourceLink
                ? 'DÜZENLE: "' + editMatch.rawData.title + '" — mevcut link dolduruldu, isterseniz değiştirin'
                : 'DÜZENLE: "' + editMatch.rawData.title + '" — yeni ürün linkini girin';
              coordsLine.classList.add('ready');
              linkInput.focus();
              linkInput.select();
              badgeRow.style.display = 'flex';
              Array.prototype.forEach.call(badgeRow.querySelectorAll('.posFinderBadgeButton'), function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-badge') === (editMatch.rawData.badge || null));
              });
              descRow.style.display = 'block';
              descTextarea.value = extractDescFromHtml(editMatch.rawData.text);
            } else {
              populateSceneSelect();
              var oldTargetData = findSceneDataById(editMatch.rawData.target);
              coordsLine.textContent = 'DÜZENLE: şu an ' + (oldTargetData ? oldTargetData.name : editMatch.rawData.target) + ' sahnesine gidiyor — yeni hedefi seçin';
              coordsLine.classList.add('ready');
            }
          }
          return;
        }
        if (mode === 'delete' && currentSceneWrapper) {
          var idx = currentSceneWrapper.editableHotspots.findIndex(function(entry) {
            return entry.hotspot.domElement() === clickedHotspotEl;
          });
          if (idx !== -1) {
            var removedEntry = currentSceneWrapper.editableHotspots[idx];
            var sceneWrapperForUndo = currentSceneWrapper;
            event.stopPropagation();
            event.preventDefault();
            if (!window.confirm('"' + removedEntry.label + '" silinsin mi?')) return;
            sceneWrapperForUndo.scene.hotspotContainer().destroyHotspot(removedEntry.hotspot);
            sceneWrapperForUndo.editableHotspots.splice(idx, 1);
            var removalRecord = null;
            if (removedEntry.ownRecord) {
              // Was added earlier in this same session - just undo the add.
              arrows = arrows.filter(function(a) { return a !== removedEntry.ownRecord; });
              saveArrows();
            } else {
              removalRecord = {
                scene: currentSceneNumber,
                kind: removedEntry.kind,
                label: removedEntry.label
              };
              removals.push(removalRecord);
              saveRemovals();
            }
            coordsLine.textContent = 'Silindi: ' + removedEntry.label;
            var restoredHotspot = null;
            var restoredEditable = null;
            pushHistory('silme (' + removedEntry.label + ')', function() {
              var el = removedEntry.kind === 'link'
                ? createLinkHotspotElement(removedEntry.rawData)
                : createInfoHotspotElement(removedEntry.rawData, sceneWrapperForUndo.data.name);
              restoredHotspot = sceneWrapperForUndo.scene.hotspotContainer().createHotspot(el, {
                yaw: removedEntry.rawData.yaw, pitch: removedEntry.rawData.pitch
              });
              restoredEditable = {
                hotspot: restoredHotspot,
                kind: removedEntry.kind,
                label: removedEntry.label,
                rawData: removedEntry.rawData,
                ownRecord: removedEntry.ownRecord
              };
              sceneWrapperForUndo.editableHotspots.push(restoredEditable);
              if (removalRecord) {
                removals = removals.filter(function(r) { return r !== removalRecord; });
                saveRemovals();
              } else if (removedEntry.ownRecord) {
                arrows.push(removedEntry.ownRecord);
                saveArrows();
              }
            }, function() {
              if (restoredHotspot) sceneWrapperForUndo.scene.hotspotContainer().destroyHotspot(restoredHotspot);
              sceneWrapperForUndo.editableHotspots = sceneWrapperForUndo.editableHotspots.filter(function(e) { return e !== restoredEditable; });
              if (removalRecord) {
                removals.push(removalRecord);
                saveRemovals();
              } else if (removedEntry.ownRecord) {
                arrows = arrows.filter(function(a) { return a !== removedEntry.ownRecord; });
                saveArrows();
              }
            });
          }
        }
        return;
      }
      if (!currentView || !currentView.screenToCoordinates) return;
      var rect = element.getBoundingClientRect();
      var coords = currentView.screenToCoordinates({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
      pendingCoords = {
        scene: currentSceneNumber,
        yaw: coords.yaw,
        pitch: coords.pitch
      };
      coordsLine.textContent = currentSceneNumber + '  yaw: ' + coords.yaw.toFixed(4) +
        '   pitch: ' + coords.pitch.toFixed(4);
      coordsLine.classList.add('ready');
      if (mode === 'product') {
        linkInput.focus();
      } else {
        populateSceneSelect();
      }
    }, true);

    addButton.addEventListener('click', function() {
      if (editingEntry) { saveEdit(); return; }
      if (mode === 'product') addEntry(); else addArrow();
    });
    linkInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') { if (editingEntry) saveEdit(); else addEntry(); }
    });

    copyButton.addEventListener('click', function() {
      var lines = [];
      if (moves.length) {
        lines.push('--- TAŞINAN İKONLAR ---');
        moves.forEach(function(m) {
          lines.push(m.scene + ' ' + m.yaw.toFixed(4) + ' ' + m.pitch.toFixed(4) + '  [' + m.kind + '] ' + m.label);
        });
      }
      if (arrows.length) {
        lines.push('--- YENİ YÖN OKLARI ---');
        arrows.forEach(function(a) {
          lines.push(a.scene + ' ' + a.yaw.toFixed(4) + ' ' + a.pitch.toFixed(4) + '  -> ' + a.targetName);
        });
      }
      if (entries.length) {
        lines.push('--- YENİ EKLENEN ÜRÜNLER ---');
        entries.forEach(function(e) {
          lines.push(e.scene + ' ' + e.yaw.toFixed(4) + ' ' + e.pitch.toFixed(4) + ' ' + e.link);
        });
      }
      if (removals.length) {
        lines.push('--- SİLİNENLER ---');
        removals.forEach(function(r) {
          lines.push(r.scene + '  [' + r.kind + '] ' + r.label);
        });
      }
      if (edits.length) {
        lines.push('--- DÜZENLENENLER ---');
        edits.forEach(function(e) {
          if (e.kind === 'info') {
            if (e.newLink) lines.push(e.scene + '  "' + e.oldTitle + '"  ->  yeni link: ' + e.newLink);
            if (e.descChanged) {
              lines.push(e.scene + '  "' + e.oldTitle + '"  YENİ AÇIKLAMA HTML: ' + e.newDescHtml);
            }
          } else if (e.kind === 'badge') {
            lines.push(e.scene + '  "' + e.title + '"  rozet: ' + (e.oldBadge || '(yok)') + ' -> ' + (e.newBadge || '(yok)'));
          } else {
            lines.push(e.scene + '  ok hedefi "' + e.oldTarget + '" -> "' + e.newTarget + '" (' + e.newTargetName + ')');
          }
        });
      }
      if (settingsChanges.length) {
        lines.push('--- AYAR DEĞİŞİKLİKLERİ ---');
        settingsChanges.forEach(function(c) {
          if (c.type === 'rename') {
            lines.push('Sahne adı: "' + c.oldName + '" -> "' + c.newName + '" (' + c.sceneId + ')');
          } else if (c.type === 'startScene') {
            lines.push('Varsayılan açılış sahnesi: ' + c.sceneName + ' (' + c.sceneId + ')');
          } else if (c.type === 'contact') {
            lines.push('İletişim: tel1=' + c.phone1 + ' tel2=' + c.phone2 + ' instagram=' + c.instagram + ' maps=' + c.mapsLink);
          } else if (c.type === 'sceneOrder') {
            lines.push('Yeni sahne sırası: ' + c.order.map(function(id) {
              var s = findSceneDataById(id);
              return s ? s.name.replace(/^\d+\.\s*/, '') : id;
            }).join(' -> '));
          } else if (c.type === 'deleteScene') {
            lines.push('SAHNE SİLİNDİ: "' + c.sceneName + '" (' + c.sceneId + ') — bu sahneye giden oklar da temizlenmeli');
          } else if (c.type === 'openingView') {
            lines.push('Açılış görünümü: "' + c.sceneName + '" (' + c.sceneId + ') -> yaw:' + c.yaw.toFixed(4) + ' pitch:' + c.pitch.toFixed(4) + ' fov:' + c.fov.toFixed(4));
          } else if (c.type === 'kioskInterval') {
            lines.push('Vitrin modu geçiş süresi: ' + c.seconds + ' saniye');
          } else if (c.type === 'tukendiNotify') {
            lines.push('Tükendi bildirimi: ' + (c.enabled ? 'açık' : 'kapalı'));
          } else if (c.type === 'campaignText') {
            lines.push(c.text ? ('Kampanya duyurusu: "' + c.text + '"') : 'Kampanya duyurusu kaldırıldı');
          } else if (c.type === 'sceneTransition') {
            lines.push('Sahne geçiş efekti: ' + c.label + ' (' + c.duration + 'ms)');
          } else if (c.type === 'featuredProduct') {
            if (!c.enabled) lines.push('Öne çıkan ürün kapalı');
            else if (c.dailyPick) lines.push('Öne çıkan ürün: Günün Seçkisi açık (featuredDailyPick: true, her gün otomatik değişir)');
            else lines.push('Öne çıkan ürün: "' + c.title + '"');
          } else if (c.type === 'backgroundMusic') {
            lines.push('Fon müziği düğmesi: ' + (c.enabled ? 'açık' : 'kapalı'));
          } else if (c.type === 'seasonalEffect') {
            lines.push('Sezonluk dekorasyon efekti: ' + c.label);
          } else if (c.type === 'hotspotIconScale') {
            lines.push('Ok/bilgi ikonu boyutu: ' + c.label + ' (' + c.value + 'x)');
          } else if (c.type === 'sceneVisibility') {
            lines.push(c.hidden
              ? ('SAHNE GİZLENDİ (bakımda): "' + c.sceneName + '" (' + c.sceneId + ') — site canlıya alınırken sidebar/vitrin modundan çıkarılmalı, sahne silinmemeli')
              : ('Sahne tekrar görünür yapıldı: "' + c.sceneName + '" (' + c.sceneId + ')'));
          } else if (c.type === 'presentationRoute') {
            lines.push('Sunum Modu rotası: ' + c.route.map(function(id) {
              var s = findSceneDataById(id);
              return s ? s.name.replace(/^\d+\.\s*/, '') : id;
            }).join(' -> '));
          } else if (c.type === 'moveProduct') {
            lines.push('ÜRÜN TAŞINDI: "' + c.title + '"  ' + c.sourceSceneName + ' (' + c.sourceSceneId + ') -> ' +
              c.targetSceneName + ' (' + c.targetSceneId + ')  yeni konum yaw:' + c.newYaw.toFixed(4) + ' pitch:' + c.newPitch.toFixed(4));
          }
        });
      }
      if (newScenes.length) {
        lines.push('--- YENİ SAHNELER ---');
        newScenes.forEach(function(ns) {
          lines.push(ns.tempId + '  "' + ns.name + '"  bağlantılar: ' +
            ns.connections.map(function(c) { return c.sceneName + ' (' + c.sceneId + ')'; }).join(', '));
        });
      }
      var text = lines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          copyButton.textContent = 'Kopyalandı!';
          setTimeout(function() { copyButton.textContent = 'Kopyala'; }, 1500);
        });
      } else {
        window.prompt('Metni kopyalayın:', text);
      }
    });

    clearButton.addEventListener('click', function() {
      if (!window.confirm('Eklenenler, oklar, taşınanlar, silinenler, düzenlemeler, ayarlar ve yeni sahneler listesi temizlensin mi?')) return;
      entries = [];
      moves = [];
      arrows = [];
      removals = [];
      edits = [];
      settingsChanges = [];
      newScenes = [];
      saveEntries();
      saveMoves();
      saveArrows();
      saveRemovals();
      saveEdits();
      saveSettingsChanges();
      saveNewScenes();
      history = [];
      redoStack = [];
      updateUndoButton();
      updateRedoButton();
    });

    updateCount();

    // Dragging existing hotspots (link arrows and info icons) to reposition them.
    var suppressNextClick = false;
    var dragging = null; // { entry, pointerId }
    var DRAG_THRESHOLD = 6;

    element.addEventListener('pointerdown', function(event) {
      var hotspotEl = event.target.closest && event.target.closest('.hotspot');
      if (!hotspotEl || !currentSceneWrapper) return;
      var match = currentSceneWrapper.editableHotspots.filter(function(entry) {
        return entry.hotspot.domElement() === hotspotEl;
      })[0];
      if (!match) return;
      event.stopPropagation();
      var livePos = match.hotspot.position();
      dragging = {
        entry: match,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCoords: { yaw: livePos.yaw, pitch: livePos.pitch },
        moved: false
      };
    }, true);

    element.addEventListener('pointermove', function(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      event.stopPropagation();
      var dx = event.clientX - dragging.startX;
      var dy = event.clientY - dragging.startY;
      if (!dragging.moved && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      if (!dragging.moved) event.preventDefault();
      dragging.moved = true;
      if (!currentView || !currentView.screenToCoordinates) return;
      var rect = element.getBoundingClientRect();
      var coords = currentView.screenToCoordinates({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
      dragging.entry.hotspot.setPosition({ yaw: coords.yaw, pitch: coords.pitch });
      dragging.lastCoords = coords;
      coordsLine.textContent = 'Taşınıyor: ' + dragging.entry.label;
      coordsLine.classList.add('ready');
    }, true);

    element.addEventListener('pointerup', function(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      event.stopPropagation();
      if (dragging.moved && dragging.lastCoords) {
        var draggedEntry = dragging.entry;
        var startCoords = dragging.startCoords;
        var endCoords = { yaw: dragging.lastCoords.yaw, pitch: dragging.lastCoords.pitch };
        if (draggedEntry.ownRecord) {
          // This hotspot was created earlier in this same session (e.g. a new
          // arrow) - update its own record instead of logging a separate move.
          draggedEntry.ownRecord.yaw = endCoords.yaw;
          draggedEntry.ownRecord.pitch = endCoords.pitch;
          saveArrows();
          coordsLine.textContent = 'Taşındı: ' + draggedEntry.label + '. Kaydedildi.';
          pushHistory('taşıma (' + draggedEntry.label + ')', function() {
            draggedEntry.hotspot.setPosition(startCoords);
            draggedEntry.ownRecord.yaw = startCoords.yaw;
            draggedEntry.ownRecord.pitch = startCoords.pitch;
            saveArrows();
          }, function() {
            draggedEntry.hotspot.setPosition(endCoords);
            draggedEntry.ownRecord.yaw = endCoords.yaw;
            draggedEntry.ownRecord.pitch = endCoords.pitch;
            saveArrows();
          });
        } else {
          var moveRecord = {
            scene: currentSceneNumber,
            kind: draggedEntry.kind,
            label: draggedEntry.label,
            yaw: endCoords.yaw,
            pitch: endCoords.pitch
          };
          moves.push(moveRecord);
          saveMoves();
          coordsLine.textContent = 'Taşındı: ' + draggedEntry.label + '. Kaydedildi.';
          pushHistory('taşıma (' + draggedEntry.label + ')', function() {
            draggedEntry.hotspot.setPosition(startCoords);
            moves = moves.filter(function(m) { return m !== moveRecord; });
            saveMoves();
          }, function() {
            draggedEntry.hotspot.setPosition(endCoords);
            moves.push(moveRecord);
            saveMoves();
          });
        }
        suppressNextClick = true;
      }
      dragging = null;
    }, true);
  }

  function setupPinchZoom(element) {
    var pinching = false;
    var startDistance = 0;
    var startFov = 0;
    var animationFrame = null;

    function touchDistance(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function cancelSnapAnimation() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    }

    function snapBack() {
      if (!currentView || currentBaseFov === null) {
        return;
      }
      var fromFov = currentView.parameters().fov;
      var duration = 250;
      var startTime = null;
      cancelSnapAnimation();
      function step(timestamp) {
        if (startTime === null) {
          startTime = timestamp;
        }
        var progress = Math.min(1, (timestamp - startTime) / duration);
        var eased = 1 - Math.pow(1 - progress, 2);
        currentView.setParameters({ fov: fromFov + (currentBaseFov - fromFov) * eased });
        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(step);
        } else {
          animationFrame = null;
        }
      }
      animationFrame = window.requestAnimationFrame(step);
    }

    element.addEventListener('touchstart', function(event) {
      if (event.touches.length === 2 && currentView) {
        cancelSnapAnimation();
        pinching = true;
        startDistance = touchDistance(event.touches);
        startFov = currentView.parameters().fov;
      }
    });

    element.addEventListener('touchmove', function(event) {
      if (pinching && event.touches.length === 2 && currentView) {
        var newDistance = touchDistance(event.touches);
        if (newDistance > 0) {
          var scale = startDistance / newDistance;
          currentView.setParameters({ fov: startFov * scale });
        }
      }
    });

    function endPinch(event) {
      if (pinching && event.touches.length < 2) {
        pinching = false;
        snapBack();
      }
    }

    element.addEventListener('touchend', endPinch);
    element.addEventListener('touchcancel', endPinch);
  }

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  // "Az önce buradaydın" breadcrumb: small thumbnails of the last few scenes
  // visited this session (not persisted), for quickly hopping back.
  var recentSceneIds = [];
  var recentScenesBar = document.createElement('div');
  recentScenesBar.id = 'recentScenesBar';
  document.body.appendChild(recentScenesBar);
  function renderRecentScenesBar() {
    recentScenesBar.innerHTML = '';
    if (!recentSceneIds.length) { recentScenesBar.classList.remove('visible'); return; }
    recentSceneIds.forEach(function(id) {
      var sceneData = findSceneDataById(id);
      if (!sceneData) return;
      var thumb = document.createElement('div');
      thumb.className = 'recentSceneThumb';
      thumb.title = sceneData.name.replace(/^\d+\.\s*/, '');
      thumb.style.backgroundImage = "url('tiles/" + id + "/preview.jpg')";
      thumb.addEventListener('click', function() {
        var wrapper = findSceneById(id);
        if (wrapper) switchScene(wrapper);
      });
      recentScenesBar.appendChild(thumb);
    });
    recentScenesBar.classList.add('visible');
  }
  function trackRecentScene(newSceneId) {
    if (!currentSceneWrapper) return;
    var leavingId = currentSceneWrapper.data.id;
    if (leavingId === newSceneId) return;
    recentSceneIds = recentSceneIds.filter(function(id) { return id !== leavingId && id !== newSceneId; });
    recentSceneIds.unshift(leavingId);
    recentSceneIds = recentSceneIds.slice(0, 3);
    renderRecentScenesBar();
  }

  function switchScene(scene) {
    stopAutorotate();
    var outgoingWrapper = currentSceneWrapper;
    if (outgoingWrapper && outgoingWrapper !== scene) trackRecentScene(scene.data.id);
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo({ transitionDuration: currentTransitionDuration });
    if (currentTransitionKey === 'zoom' && outgoingWrapper && outgoingWrapper !== scene) {
      animateZoomPush(outgoingWrapper.view, currentTransitionDuration);
    }
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
    currentView = scene.view;
    currentBaseFov = scene.data.initialViewParameters.fov;
    currentSceneNumber = scenes.indexOf(scene) + 1;
    currentSceneWrapper = scene;
    maybeOpenFeaturedProduct(scene);
    setTimeout(function() { prefetchNeighborTiles(scene); }, 800);
  }

  // "Yakınlaşarak Geçiş" transition preset: as the outgoing scene crossfades
  // out, push its own view in slightly (narrower fov) so the room feels like
  // it's being walked through rather than just dissolving flatly.
  function animateZoomPush(view, duration) {
    var params = view.parameters();
    var startFov = params.fov;
    var targetFov = startFov * 0.82;
    var startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var t = Math.min(1, (ts - startTime) / duration);
      view.setParameters({ fov: startFov + (targetFov - startFov) * t });
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  // Warm the browser's HTTP cache with the lowest tile level (single
  // 512x512 tile per face) of every directly-connected neighboring scene,
  // so clicking an arrow shows an immediate low-res preview instead of a
  // blank pano while full-resolution tiles stream in. Only ever prefetches
  // each scene once per page load, and only after the current scene's own
  // transition has settled so it doesn't compete for bandwidth.
  var prefetchedSceneIds = {};
  function prefetchNeighborTiles(scene) {
    (scene.data.linkHotspots || []).forEach(function(h) {
      var targetId = h.target;
      if (prefetchedSceneIds[targetId]) return;
      prefetchedSceneIds[targetId] = true;
      ['f', 'b', 'l', 'r', 'u', 'd'].forEach(function(face) {
        var img = new Image();
        img.src = 'tiles/' + targetId + '/1/' + face + '/0/0.jpg';
      });
    });
  }

  // "Günün Seçkisi": picks a different product each calendar day, the same
  // pick for everyone that day, with no server involved - just today's
  // date used to index into every product title, in scene order.
  function pickDailyFeaturedTitle() {
    var titles = [];
    data.scenes.forEach(function(s) {
      (s.infoHotspots || []).forEach(function(h) { titles.push(h.title); });
    });
    if (!titles.length) return null;
    var now = new Date();
    var dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    return titles[dayOfYear % titles.length];
  }

  // If a featured product is set and enabled, and it lives in this scene,
  // auto-open its info bubble shortly after arriving.
  function maybeOpenFeaturedProduct(scene) {
    if (!data.settings || !data.settings.featuredProductEnabled) return;
    var title = data.settings.featuredDailyPick ? pickDailyFeaturedTitle() : data.settings.featuredProductTitle;
    if (!title) return;
    var match = (scene.editableHotspots || []).filter(function(e) {
      return e.kind === 'info' && e.rawData && e.rawData.title === title;
    })[0];
    if (!match) return;
    var header = match.hotspot.domElement().querySelector('.info-hotspot-header');
    if (header) setTimeout(function() { header.click(); }, 600);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(translatedSceneName(scene.data));
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(6000, idlePan);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot, sceneName, siblingHotspots) {
    siblingHotspots = siblingHotspots || [];

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    if (hotspot.badge) {
      var badgeEl = document.createElement('div');
      badgeEl.classList.add('info-hotspot-badge');
      badgeEl.setAttribute('data-badge', hotspot.badge);
      badgeEl.textContent = hotspot.badge;
      iconWrapper.appendChild(badgeEl);
    }

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Small actions row: favorite toggle + listen-aloud, sitting above the
    // WhatsApp link so neither the bubble layout nor the tap-to-open header
    // interaction needs to change.
    var actionsRow = document.createElement('div');
    actionsRow.classList.add('info-hotspot-actions');

    var favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.classList.add('info-hotspot-favorite');
    function refreshFavButton() {
      var isFav = isProductFavorited(hotspot.title);
      favBtn.textContent = isFav ? '♥' : '♡';
      favBtn.classList.toggle('active', isFav);
      favBtn.title = isFav ? uiText('unfavoriteLabel', 'Favorilerden çıkar') : uiText('favoriteLabel', 'Favorilere ekle');
    }
    favBtn.addEventListener('click', function(event) {
      event.stopPropagation();
      var wasFav = isProductFavorited(hotspot.title);
      toggleProductFavorite(hotspot.title, sceneName);
      refreshFavButton();
      if (!wasFav) spawnHeartBurst(favBtn);
    });
    refreshFavButton();
    actionsRow.appendChild(favBtn);

    if (window.speechSynthesis) {
      var listenBtn = document.createElement('button');
      listenBtn.type = 'button';
      listenBtn.classList.add('info-hotspot-listen');
      listenBtn.textContent = '🔊';
      listenBtn.title = uiText('listenLabel', 'Sesli dinle');

      var listenMoreBtn = document.createElement('button');
      listenMoreBtn.type = 'button';
      listenMoreBtn.classList.add('info-hotspot-listen-more');
      listenMoreBtn.textContent = uiText('listenMoreLabel', '▶ Devamını dinle');
      listenMoreBtn.style.display = 'none';

      var plainTitleForSpeech = stripHtmlForSpeech(hotspot.title);
      var narrationTeaser = splitNarrationTeaser(stripHtmlForSpeech(hotspot.text));

      function speakText(text, onEnd) {
        var utter = new SpeechSynthesisUtterance(text);
        utter.lang = currentLang === 'en' ? 'en-US' : (currentLang === 'ru' ? 'ru-RU' : 'tr-TR');
        var matchedVoice = pickVoiceForLang(utter.lang);
        if (matchedVoice) utter.voice = matchedVoice;
        utter.onend = function() { listenBtn.classList.remove('speaking'); if (onEnd) onEnd(); };
        utter.onerror = function() { listenBtn.classList.remove('speaking'); };
        listenBtn.classList.add('speaking');
        window.speechSynthesis.speak(utter);
      }

      listenBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          listenBtn.classList.remove('speaking');
          return;
        }
        listenMoreBtn.style.display = 'none';
        speakText(plainTitleForSpeech + '. ' + narrationTeaser.teaser, function() {
          if (narrationTeaser.rest) listenMoreBtn.style.display = 'inline-block';
        });
      });
      actionsRow.appendChild(listenBtn);

      listenMoreBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        listenMoreBtn.style.display = 'none';
        speakText(narrationTeaser.rest, null);
      });
      actionsRow.appendChild(listenMoreBtn);
    }
    text.appendChild(actionsRow);

    // Quick links to the other products in this same room, so a visitor
    // doesn't have to close the card and go hunting for the next one.
    var otherProducts = siblingHotspots.filter(function(h) { return h.title !== hotspot.title; });
    if (otherProducts.length) {
      var otherWrap = document.createElement('div');
      otherWrap.className = 'info-hotspot-others';
      var otherLabel = document.createElement('div');
      otherLabel.className = 'info-hotspot-others-label';
      otherLabel.textContent = uiText('otherProductsLabel', 'Bu odadaki diğer ürünler');
      otherWrap.appendChild(otherLabel);
      otherProducts.forEach(function(other) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'info-hotspot-other-chip';
        chip.textContent = stripHtmlForSpeech(other.title);
        chip.addEventListener('click', function(event) {
          event.stopPropagation();
          wrapper.classList.remove('visible');
          modal.classList.remove('visible');
          var titleEls = document.querySelectorAll('.hotspot.info-hotspot .info-hotspot-title');
          for (var i = 0; i < titleEls.length; i++) {
            if (titleEls[i].textContent === other.title) {
              var otherHeader = titleEls[i].closest('.info-hotspot').querySelector('.info-hotspot-header');
              if (otherHeader) otherHeader.click();
              break;
            }
          }
        });
        otherWrap.appendChild(chip);
      });
      text.appendChild(otherWrap);
    }

    // Create a WhatsApp "ask about this product" link, if requested. If the
    // product is badged "Tükendi" AND the admin has explicitly turned on
    // restock notifications (off by default - the badge alone doesn't mean
    // the warehouse is actually empty), the message/button switch to asking
    // to be notified instead of a generic info request.
    if (hotspot.whatsapp) {
      var isSoldOutNotify = hotspot.badge === 'Tükendi' && !!(data.settings && data.settings.tukendiNotifyEnabled);
      var waTemplate = uiText(isSoldOutNotify ? 'whatsappSoldOutMessage' : 'whatsappProductMessage', null);
      var waMessage = waTemplate
        ? waTemplate.replace('{title}', hotspot.title).replace('{scene}', sceneName)
        : (isSoldOutNotify
          ? 'Merhaba, "' + hotspot.title + '" ürünü tükenmiş görünüyor. Stoğa gelince haber verir misiniz? (Sanal tur: ' + sceneName + ')'
          : 'Merhaba, "' + hotspot.title + '" ürünü hakkında bilgi almak istiyorum. (Sanal tur: ' + sceneName + ')');
      var waLink = document.createElement('a');
      waLink.href = 'https://wa.me/905493320707?text=' + encodeURIComponent(waMessage);
      waLink.target = '_blank';
      waLink.rel = 'noopener';
      waLink.classList.add('info-hotspot-whatsapp');
      waLink.textContent = isSoldOutNotify
        ? uiText('whatsappSoldOutButton', 'Stoğa gelince haber ver')
        : uiText('whatsappProductButton', 'Bu ürün hakkında daha fazla bilgi al');
      text.appendChild(waLink);
    }

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      var opening = wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
      if (opening && window.speechSynthesis) showVoiceTipOnce();
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Live-updates a badge ("Yeni"/"İndirimde"/"Tükendi") on an already-created
  // info hotspot without destroying/recreating it. Only touches the pano
  // element, not its mobile modal clone - the modal will pick up the badge
  // correctly on the next real page load once the change is applied to data.js.
  function updateHotspotBadgeDom(entry) {
    var container = entry.hotspot.domElement();
    var iconWrapperEl = container.querySelector('.info-hotspot-icon-wrapper');
    if (!iconWrapperEl) return;
    var existing = iconWrapperEl.querySelector('.info-hotspot-badge');
    if (existing) existing.parentNode.removeChild(existing);
    if (entry.rawData.badge) {
      var badgeEl = document.createElement('div');
      badgeEl.classList.add('info-hotspot-badge');
      badgeEl.setAttribute('data-badge', entry.rawData.badge);
      badgeEl.textContent = entry.rawData.badge;
      iconWrapperEl.appendChild(badgeEl);
    }
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Very subtle, time-of-day-tinted wash over the whole view - a nod to how
  // the actual showroom looks different in morning/evening light. Picked
  // once per page load, not updated live while browsing.
  (function applyTimeOfDayOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'timeOfDayOverlay';
    document.body.appendChild(overlay);
    var h = new Date().getHours();
    var color, opacity;
    if (h >= 5 && h < 10) { color = '#cfe8ff'; opacity = 0.06; }
    else if (h >= 17 && h < 21) { color = '#ffb35c'; opacity = 0.07; }
    else if (h >= 21 || h < 5) { color = '#1a2440'; opacity = 0.12; }
    else { color = 'transparent'; opacity = 0; }
    overlay.style.backgroundColor = color;
    overlay.style.opacity = String(opacity);
  })();

  // Display the initial scene - a shared link's ?scene=&yaw=&pitch= (see
  // shareTour()) overrides the normal opening scene so the exact view a
  // visitor shared is what the next person lands on.
  (function() {
    var sceneMatch = /[?&]scene=([^&]+)/.exec(window.location.search);
    var deepLinkTarget = sceneMatch ? findSceneById(decodeURIComponent(sceneMatch[1])) : null;
    switchScene(deepLinkTarget || scenes[0]);
    if (deepLinkTarget) {
      var yawMatch = /[?&]yaw=([^&]+)/.exec(window.location.search);
      var pitchMatch = /[?&]pitch=([^&]+)/.exec(window.location.search);
      var yaw = yawMatch ? parseFloat(yawMatch[1]) : NaN;
      var pitch = pitchMatch ? parseFloat(pitchMatch[1]) : NaN;
      if (!isNaN(yaw) && !isNaN(pitch)) {
        deepLinkTarget.view.setParameters({ yaw: yaw, pitch: pitch });
      }
    }
  })();

  // Hide the branded splash screen once the first scene has had a moment to render.
  var splashElement = document.querySelector('#splash');
  if (splashElement) {
    setTimeout(function() {
      splashElement.classList.add('hidden');
    }, 700);
  }

  // One-time "door opening" reveal for the very first scene only: two panels
  // covering the pano slide apart right as the splash fades, instead of the
  // first room just appearing flatly underneath.
  (function setupDoorReveal() {
    var doorLeft = document.createElement('div');
    doorLeft.className = 'doorPanel';
    doorLeft.id = 'doorLeft';
    var doorRight = document.createElement('div');
    doorRight.className = 'doorPanel';
    doorRight.id = 'doorRight';
    document.body.appendChild(doorLeft);
    document.body.appendChild(doorRight);
    setTimeout(function() {
      doorLeft.classList.add('opening');
      doorRight.classList.add('opening');
      setTimeout(function() {
        if (doorLeft.parentNode) doorLeft.parentNode.removeChild(doorLeft);
        if (doorRight.parentNode) doorRight.parentNode.removeChild(doorRight);
      }, 1300);
    }, 750);
  })();

  // Kiosk/showroom mode: add ?kiosk=1 to the URL on a screen left running in
  // the store, and the tour advances through every scene on its own. Pauses
  // while someone is actually dragging the view around, resumes afterwards.
  if (/[?&]kiosk=1/.test(window.location.search)) {
    setupKioskMode();
  }

  // "Sunum Modu": an on-demand scripted walkthrough any visitor (or a
  // presenter running a live demo) can start with one tap - switches
  // through the admin-picked route on a timer, shows progress, and pauses
  // the moment someone actually drags the view (a small "devam et" button
  // lets them pick the script back up instead of losing their place).
  (function setupPresentationMode() {
    var STEP_SECONDS = 9;
    var active = false;
    var timer = null;
    var route = [];
    var stepIndex = 0;

    var startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.id = 'presentationStartButton';
    startBtn.className = 'visible';
    startBtn.textContent = '▶ ' + uiText('presentationStartLabel', 'Sunumu Başlat');
    document.body.appendChild(startBtn);

    var progressBar = document.createElement('div');
    progressBar.id = 'presentationProgress';
    document.body.appendChild(progressBar);

    var resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.id = 'presentationResumeButton';
    resumeBtn.textContent = '▶ ' + uiText('presentationResumeLabel', 'Sunuma Devam Et');
    document.body.appendChild(resumeBtn);

    var closingCard = document.createElement('div');
    closingCard.id = 'presentationClosing';
    var closingTitle = document.createElement('div');
    closingTitle.id = 'presentationClosingTitle';
    closingTitle.textContent = uiText('presentationClosingTitle', 'Turu gezdiğiniz için teşekkürler!');
    var closingButtons = document.createElement('div');
    closingButtons.id = 'presentationClosingButtons';
    var restartBtn = document.createElement('button');
    restartBtn.type = 'button';
    restartBtn.textContent = uiText('presentationRestartLabel', '↻ Baştan Başlat');
    var waBtn = document.createElement('button');
    waBtn.type = 'button';
    waBtn.textContent = uiText('presentationWhatsappLabel', "💬 WhatsApp'tan Konuşalım");
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = uiText('closeLabel', 'Kapat');
    closingButtons.appendChild(restartBtn);
    closingButtons.appendChild(waBtn);
    closingButtons.appendChild(closeBtn);
    closingCard.appendChild(closingTitle);
    closingCard.appendChild(closingButtons);
    document.body.appendChild(closingCard);

    function buildRoute() {
      var ids = (currentPresentationRoute && currentPresentationRoute.length >= 2)
        ? currentPresentationRoute
        : data.scenes.filter(function(s) { return !hiddenSceneIds[s.id]; }).map(function(s) { return s.id; });
      var wrappers = [];
      ids.forEach(function(id) {
        var w = findSceneById(id);
        if (w) wrappers.push(w);
      });
      return wrappers;
    }

    function updateProgress() {
      var s = route[stepIndex];
      progressBar.textContent = (stepIndex + 1) + ' / ' + route.length + (s ? (' · ' + s.data.name.replace(/^\d+\.\s*/, '')) : '');
    }

    function scheduleAdvance() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(advance, STEP_SECONDS * 1000);
    }

    function advance() {
      stepIndex++;
      if (stepIndex >= route.length) { endPresentation(); return; }
      switchScene(route[stepIndex]);
      updateProgress();
      scheduleAdvance();
    }

    function startPresentation() {
      route = buildRoute();
      if (route.length < 2) return;
      active = true;
      stepIndex = 0;
      startBtn.classList.remove('visible');
      closingCard.classList.remove('visible');
      resumeBtn.classList.remove('visible');
      progressBar.classList.add('visible');
      switchScene(route[0]);
      updateProgress();
      scheduleAdvance();
    }

    function pausePresentation() {
      if (!active) return;
      if (timer) clearTimeout(timer);
      resumeBtn.classList.add('visible');
    }

    function endPresentation() {
      active = false;
      if (timer) clearTimeout(timer);
      progressBar.classList.remove('visible');
      resumeBtn.classList.remove('visible');
      closingCard.classList.add('visible');
    }

    startBtn.addEventListener('click', startPresentation);
    resumeBtn.addEventListener('click', function() {
      resumeBtn.classList.remove('visible');
      scheduleAdvance();
    });
    restartBtn.addEventListener('click', function() {
      closingCard.classList.remove('visible');
      startPresentation();
    });
    closeBtn.addEventListener('click', function() {
      closingCard.classList.remove('visible');
      startBtn.classList.add('visible');
    });
    waBtn.addEventListener('click', function() {
      var msg = uiText('whatsappGeneralMessage', 'Merhaba, sanal turu gezdim, bilgi almak istiyorum.');
      window.open('https://wa.me/905493320707?text=' + encodeURIComponent(msg), '_blank');
    });
    panoElement.addEventListener('pointerdown', function() {
      if (active) pausePresentation();
    });
  })();

  function setupKioskMode() {
    var intervalSeconds = (data.settings && data.settings.kioskIntervalSeconds) || 8;
    var kioskIndex = 0;
    var kioskTimer = null;

    function scheduleNext() {
      if (kioskTimer) clearTimeout(kioskTimer);
      kioskTimer = setTimeout(advance, intervalSeconds * 1000);
    }
    function advance() {
      var attempts = 0;
      do {
        kioskIndex = (kioskIndex + 1) % scenes.length;
        attempts++;
      } while (hiddenSceneIds[scenes[kioskIndex].data.id] && attempts <= scenes.length);
      switchScene(scenes[kioskIndex]);
      scheduleNext();
    }
    scheduleNext();

    panoElement.addEventListener('pointerdown', function() {
      if (kioskTimer) clearTimeout(kioskTimer);
    });
    panoElement.addEventListener('pointerup', function() {
      scheduleNext();
    });
  }

})();
