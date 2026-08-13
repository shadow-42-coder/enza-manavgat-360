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
      var element = createInfoHotspotElement(hotspot, data.name);
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
    el.querySelector('.text').innerHTML = sanitize(scene.data.name);
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // Mobile: pinch with two fingers to zoom; release to snap back to the
  // scene's normal view instead of staying zoomed in.
  var currentView = null;
  var currentBaseFov = null;
  var currentSceneNumber = null;
  var currentSceneWrapper = null;
  setupPinchZoom(panoElement);

  // TEMP: product-link collector tool, remove once all product hotspots
  // are placed. Add ?pos=1 to the URL: tap anywhere on the pano, paste the
  // product link, tap "Ekle". Walk through the whole store this way, then
  // tap "Kopyala" to copy every entry as text and send it back in one go.
  if (/[?&]pos=1/.test(window.location.search)) {
    setupPositionCollector(panoElement);
    loadScript('vendor/jszip.min.js', function() {
      loadScript('photo-tool.js', function() {
        document.body.classList.add('photo-tool-ready');
        document.dispatchEvent(new Event('enzaPhotoToolReady'));
      });
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

    var ADD_KEY = 'enzaPosCollectorEntries';
    var MOVE_KEY = 'enzaPosCollectorMoves';
    var ARROW_KEY = 'enzaPosCollectorArrows';
    var REMOVE_KEY = 'enzaPosCollectorRemovals';
    var EDIT_KEY = 'enzaPosCollectorEdits';
    var SETTINGS_KEY = 'enzaPosCollectorSettings';
    var entries = [];
    var moves = [];
    var arrows = [];
    var removals = [];
    var edits = [];
    var settingsChanges = [];
    try { entries = JSON.parse(window.localStorage.getItem(ADD_KEY) || '[]'); } catch (e) { entries = []; }
    try { moves = JSON.parse(window.localStorage.getItem(MOVE_KEY) || '[]'); } catch (e) { moves = []; }
    try { arrows = JSON.parse(window.localStorage.getItem(ARROW_KEY) || '[]'); } catch (e) { arrows = []; }
    try { removals = JSON.parse(window.localStorage.getItem(REMOVE_KEY) || '[]'); } catch (e) { removals = []; }
    try { edits = JSON.parse(window.localStorage.getItem(EDIT_KEY) || '[]'); } catch (e) { edits = []; }
    try { settingsChanges = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '[]'); } catch (e) { settingsChanges = []; }
    var pendingCoords = null;
    var editingEntry = null;
    var mode = 'product'; // 'product' | 'link' | 'delete' | 'photo' | 'settings'

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
    modeRow.appendChild(productModeButton);
    modeRow.appendChild(linkModeButton);
    modeRow.appendChild(deleteModeButton);
    modeRow.appendChild(photoModeButton);
    modeRow.appendChild(settingsModeButton);

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
    actionRow.appendChild(countLabel);
    actionRow.appendChild(copyButton);
    actionRow.appendChild(clearButton);

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

    function settingsSection(titleText) {
      var section = document.createElement('div');
      section.className = 'posFinderSettingsSection';
      var title = document.createElement('div');
      title.className = 'posFinderSettingsTitle';
      title.textContent = titleText;
      section.appendChild(title);
      return section;
    }

    // -- Rename scene --
    var renameSection = settingsSection('Sahne adını değiştir');
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
    var startSection = settingsSection('Varsayılan açılış sahnesi');
    var startSceneSelect = document.createElement('select');
    var startButton = document.createElement('button');
    startButton.textContent = 'Varsayılan Yap';
    startSection.appendChild(startSceneSelect);
    startSection.appendChild(startButton);

    // -- Contact info --
    var contactSection = settingsSection('İletişim bilgileri');
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

    var settingsStatus = document.createElement('div');
    settingsStatus.id = 'posFinderSettingsStatus';

    settingsPanel.appendChild(renameSection);
    settingsPanel.appendChild(startSection);
    settingsPanel.appendChild(contactSection);
    settingsPanel.appendChild(settingsStatus);

    box.appendChild(modeRow);
    box.appendChild(coordsLine);
    box.appendChild(inputRow);
    box.appendChild(photoPanel);
    box.appendChild(settingsPanel);
    box.appendChild(actionRow);
    document.body.appendChild(box);

    function resetInputRowForAdd() {
      editingEntry = null;
      addButton.textContent = 'Ekle';
      linkInput.value = '';
    }

    function setMode(newMode) {
      mode = newMode;
      productModeButton.classList.toggle('active', mode === 'product');
      linkModeButton.classList.toggle('active', mode === 'link');
      deleteModeButton.classList.toggle('active', mode === 'delete');
      photoModeButton.classList.toggle('active', mode === 'photo');
      settingsModeButton.classList.toggle('active', mode === 'settings');
      linkInput.style.display = mode === 'product' ? '' : 'none';
      sceneSelect.style.display = mode === 'link' ? '' : 'none';
      inputRow.style.display = (mode === 'delete' || mode === 'photo' || mode === 'settings') ? 'none' : 'flex';
      photoPanel.style.display = mode === 'photo' ? 'block' : 'none';
      settingsPanel.style.display = mode === 'settings' ? 'block' : 'none';
      actionRow.style.display = (mode === 'photo' || mode === 'settings') ? 'none' : 'flex';
      coordsLine.style.display = (mode === 'photo' || mode === 'settings') ? 'none' : '';
      pendingCoords = null;
      resetInputRowForAdd();
      coordsLine.classList.remove('ready');
      if (mode === 'product') coordsLine.textContent = 'Boş bir yere tıklayın (yeni ürün) veya var olan bir baloncuğa tıklayın (düzenle)';
      else if (mode === 'link') coordsLine.textContent = 'Ok başlayacağı yere tıklayın (yeni ok) veya var olan bir oka tıklayın (düzenle)';
      else if (mode === 'delete') coordsLine.textContent = 'Silmek istediğiniz ikona dokunun';
      if (mode === 'photo') populatePhotoSceneSelect();
      if (mode === 'settings') populateSettingsPanel();
    }
    productModeButton.addEventListener('click', function() { setMode('product'); });
    linkModeButton.addEventListener('click', function() { setMode('link'); });
    deleteModeButton.addEventListener('click', function() { setMode('delete'); });
    photoModeButton.addEventListener('click', function() { setMode('photo'); });
    settingsModeButton.addEventListener('click', function() { setMode('settings'); });

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
      if (!renameSceneSelect.options.length) {
        data.scenes.forEach(function(s, i) {
          var opt1 = document.createElement('option');
          opt1.value = s.id;
          opt1.textContent = (i + 1) + '. ' + s.name.replace(/^\d+\.\s*/, '');
          renameSceneSelect.appendChild(opt1);
          var opt2 = opt1.cloneNode(true);
          startSceneSelect.appendChild(opt2);
        });
        renameSceneSelect.addEventListener('change', function() {
          var s = findSceneDataById(renameSceneSelect.value);
          renameInput.value = s ? s.name.replace(/^\d+\.\s*/, '') : '';
        });
        renameSceneSelect.dispatchEvent(new Event('change'));
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
    }

    function saveEdits() { window.localStorage.setItem(EDIT_KEY, JSON.stringify(edits)); updateCount(); }
    function saveSettingsChanges() { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsChanges)); updateCount(); }

    renameButton.addEventListener('click', function() {
      var sceneId = renameSceneSelect.value;
      var newName = renameInput.value.trim();
      if (!sceneId || !newName) return;
      var s = findSceneDataById(sceneId);
      settingsChanges.push({ type: 'rename', sceneId: sceneId, oldName: s ? s.name : sceneId, newName: newName });
      saveSettingsChanges();
      settingsStatus.textContent = 'Kaydedildi: ' + sceneId + ' -> "' + newName + '"';
    });

    startButton.addEventListener('click', function() {
      var sceneId = startSceneSelect.value;
      if (!sceneId) return;
      var s = findSceneDataById(sceneId);
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'startScene'; });
      settingsChanges.push({ type: 'startScene', sceneId: sceneId, sceneName: s ? s.name : sceneId });
      saveSettingsChanges();
      settingsStatus.textContent = 'Varsayılan açılış sahnesi: ' + (s ? s.name : sceneId);
    });

    contactButton.addEventListener('click', function() {
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'contact'; });
      settingsChanges.push({
        type: 'contact',
        phone1: phone1Input.value.trim(),
        phone2: phone2Input.value.trim(),
        instagram: instagramInput.value.trim(),
        mapsLink: mapsInput.value.trim()
      });
      saveSettingsChanges();
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

    function updateCount() {
      countLabel.textContent = entries.length + ' ürün, ' + arrows.length + ' yeni ok, ' +
        moves.length + ' taşındı, ' + removals.length + ' silindi, ' +
        edits.length + ' düzenlendi, ' + settingsChanges.length + ' ayar';
    }

    function saveEntries() { window.localStorage.setItem(ADD_KEY, JSON.stringify(entries)); updateCount(); }
    function saveMoves() { window.localStorage.setItem(MOVE_KEY, JSON.stringify(moves)); updateCount(); }
    function saveRemovals() { window.localStorage.setItem(REMOVE_KEY, JSON.stringify(removals)); updateCount(); }
    function saveArrows() { window.localStorage.setItem(ARROW_KEY, JSON.stringify(arrows)); updateCount(); }

    function addEntry() {
      var link = linkInput.value.trim();
      if (!pendingCoords || !link) return;
      entries.push({
        scene: pendingCoords.scene,
        yaw: pendingCoords.yaw,
        pitch: pendingCoords.pitch,
        link: link
      });
      saveEntries();
      linkInput.value = '';
      pendingCoords = null;
      coordsLine.textContent = 'Eklendi. Bir sonraki ürüne tıklayın...';
      coordsLine.classList.remove('ready');
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
      currentSceneWrapper.editableHotspots.push({
        hotspot: marzipanoHotspot,
        kind: 'link',
        label: 'Yön oku → ' + targetId,
        ownRecord: arrowRecord // if dragged, update this record instead of logging a separate move
      });
      arrows.push(arrowRecord);
      saveArrows();
      pendingCoords = null;
      coordsLine.textContent = 'Ok eklendi (' + targetData.name + '). Şimdi sürükleyip tam yerine koyabilirsiniz.';
      coordsLine.classList.remove('ready');
    }

    function saveEdit() {
      if (!editingEntry) return;
      if (editingEntry.kind === 'info') {
        var newLink = linkInput.value.trim();
        if (!newLink) return;
        edits.push({
          scene: currentSceneNumber,
          kind: 'info',
          oldTitle: editingEntry.rawData.title,
          newLink: newLink
        });
        saveEdits();
        coordsLine.textContent = 'Düzenleme kaydedildi: ' + editingEntry.rawData.title + ' -> yeni link';
      } else if (editingEntry.kind === 'link') {
        var newTargetId = sceneSelect.value;
        if (!newTargetId) return;
        var newTargetData = findSceneDataById(newTargetId);
        var oldTargetId = editingEntry.rawData.target;
        edits.push({
          scene: currentSceneNumber,
          kind: 'link',
          oldTarget: oldTargetId,
          newTarget: newTargetId,
          newTargetName: newTargetData ? newTargetData.name : newTargetId
        });
        saveEdits();
        // Live-update: the click handler reads hotspot.target fresh each time,
        // so mutating the same object updates the arrow's behavior immediately.
        editingEntry.rawData.target = newTargetId;
        editingEntry.label = 'Yön oku → ' + newTargetId;
        coordsLine.textContent = 'Düzenleme kaydedildi: artık ' + (newTargetData ? newTargetData.name : newTargetId) + ' sahnesine gidiyor';
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
              linkInput.value = '';
              coordsLine.textContent = 'DÜZENLE: "' + editMatch.rawData.title + '" — yeni ürün linkini girin';
              coordsLine.classList.add('ready');
              linkInput.focus();
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
            event.stopPropagation();
            event.preventDefault();
            removedEntry.hotspot.destroy();
            currentSceneWrapper.editableHotspots.splice(idx, 1);
            if (removedEntry.ownRecord) {
              // Was added earlier in this same session - just undo the add.
              arrows = arrows.filter(function(a) { return a !== removedEntry.ownRecord; });
              saveArrows();
            } else {
              removals.push({
                scene: currentSceneNumber,
                kind: removedEntry.kind,
                label: removedEntry.label
              });
              saveRemovals();
            }
            coordsLine.textContent = 'Silindi: ' + removedEntry.label;
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
            lines.push(e.scene + '  "' + e.oldTitle + '"  ->  yeni link: ' + e.newLink);
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
          }
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
      if (!window.confirm('Eklenenler, oklar, taşınanlar, silinenler, düzenlemeler ve ayarlar listesi temizlensin mi?')) return;
      entries = [];
      moves = [];
      arrows = [];
      removals = [];
      edits = [];
      settingsChanges = [];
      saveEntries();
      saveMoves();
      saveArrows();
      saveRemovals();
      saveEdits();
      saveSettingsChanges();
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
      dragging = {
        entry: match,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
    }, true);

    element.addEventListener('pointermove', function(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
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
      if (dragging.moved && dragging.lastCoords) {
        if (dragging.entry.ownRecord) {
          // This hotspot was created earlier in this same session (e.g. a new
          // arrow) - update its own record instead of logging a separate move.
          dragging.entry.ownRecord.yaw = dragging.lastCoords.yaw;
          dragging.entry.ownRecord.pitch = dragging.lastCoords.pitch;
          saveArrows();
        } else {
          moves.push({
            scene: currentSceneNumber,
            kind: dragging.entry.kind,
            label: dragging.entry.label,
            yaw: dragging.lastCoords.yaw,
            pitch: dragging.lastCoords.pitch
          });
          saveMoves();
        }
        coordsLine.textContent = 'Taşındı: ' + dragging.entry.label + '. Kaydedildi.';
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

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
    currentView = scene.view;
    currentBaseFov = scene.data.initialViewParameters.fov;
    currentSceneNumber = scenes.indexOf(scene) + 1;
    currentSceneWrapper = scene;
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
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
    viewer.setIdleMovement(Infinity);
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

  function createInfoHotspotElement(hotspot, sceneName) {

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

    // Create a WhatsApp "ask about this product" link, if requested.
    if (hotspot.whatsapp) {
      var waMessage = 'Merhaba, "' + hotspot.title + '" ürünü hakkında bilgi almak ' +
        'istiyorum. (Sanal tur: ' + sceneName + ')';
      var waLink = document.createElement('a');
      waLink.href = 'https://wa.me/905493320707?text=' + encodeURIComponent(waMessage);
      waLink.target = '_blank';
      waLink.rel = 'noopener';
      waLink.classList.add('info-hotspot-whatsapp');
      waLink.textContent = 'Bu ürün hakkında daha fazla bilgi al';
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
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
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

  // Display the initial scene.
  switchScene(scenes[0]);

  // Hide the branded splash screen once the first scene has had a moment to render.
  var splashElement = document.querySelector('#splash');
  if (splashElement) {
    setTimeout(function() {
      splashElement.classList.add('hidden');
    }, 700);
  }

})();
