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
    if (window.sessionStorage.getItem('enzaAdminAuthed') === '1') {
      initAdminPanel();
    } else {
      showAdminLogin(initAdminPanel);
    }
  }

  function initAdminPanel() {
    setupPositionCollector(panoElement);
    loadScript('vendor/jszip.min.js', function() {
      loadScript('photo-tool.js', function() {
        document.body.classList.add('photo-tool-ready');
        document.dispatchEvent(new Event('enzaPhotoToolReady'));
      });
    });
  }

  function showAdminLogin(onSuccess) {
    var ADMIN_USER = 'ENZAHOME-MANAVGAT';
    var ADMIN_PASS = 'yedi10077';

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
      if (userInput.value === ADMIN_USER && passInput.value === ADMIN_PASS) {
        window.sessionStorage.setItem('enzaAdminAuthed', '1');
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

    // Single-level-per-step undo history for this session. Each performed
    // action pushes { label, undo } here; the "Geri Al" button pops and
    // runs the most recent one.
    var history = [];
    function pushHistory(label, undoFn) {
      history.push({ label: label, undo: undoFn });
      updateUndoButton();
    }
    function updateUndoButton() {
      if (!undoButton) return;
      undoButton.disabled = history.length === 0;
      undoButton.title = history.length ? ('Geri al: ' + history[history.length - 1].label) : '';
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
    actionRow.appendChild(countLabel);
    actionRow.appendChild(undoButton);
    actionRow.appendChild(copyButton);
    actionRow.appendChild(clearButton);

    undoButton.addEventListener('click', function() {
      var last = history.pop();
      if (!last) return;
      last.undo();
      updateUndoButton();
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

    // New scene creation panel: name + photo + which existing scenes to connect to.
    var newScenePanel = document.createElement('div');
    newScenePanel.id = 'posFinderNewScenePanel';
    newScenePanel.style.display = 'none';

    var newSceneInfoSection = settingsSection('Yeni sahne bilgisi');
    var newSceneNameInput = document.createElement('input');
    newSceneNameInput.type = 'text';
    newSceneNameInput.placeholder = 'Yeni sahnenin adı (ör. Depo Girişi)';
    var newScenePhotoFile = document.createElement('input');
    newScenePhotoFile.type = 'file';
    newScenePhotoFile.accept = 'image/*';
    newSceneInfoSection.appendChild(newSceneNameInput);
    newSceneInfoSection.appendChild(newScenePhotoFile);

    var newSceneConnSection = settingsSection('Hangi sahnelere bağlansın? (çift yönlü)');
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

    newScenePanel.appendChild(newSceneInfoSection);
    newScenePanel.appendChild(newSceneConnSection);
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

    var listResults = document.createElement('div');
    listResults.id = 'posFinderListResults';

    listPanel.appendChild(listSearchInput);
    listPanel.appendChild(listResults);

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

    function renderListResults(filterText) {
      var items = buildProductIndex();
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
        row.appendChild(label);
        row.appendChild(btnUp);
        row.appendChild(btnDown);
        orderList.appendChild(row);
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
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'sceneOrder'; });
      var newOrder = data.scenes.map(function(s) { return s.id; });
      settingsChanges.push({ type: 'sceneOrder', order: newOrder });
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
      });
    });

    box.appendChild(modeRow);
    box.appendChild(coordsLine);
    box.appendChild(inputRow);
    box.appendChild(photoPanel);
    box.appendChild(settingsPanel);
    box.appendChild(newScenePanel);
    box.appendChild(listPanel);
    box.appendChild(mapPanel);
    box.appendChild(orderPanel);
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
      if (mode === 'list') renderListResults(listSearchInput.value);
      if (mode === 'map') renderMap();
      if (mode === 'order') renderOrderList();
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
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges.push({ type: 'rename', sceneId: sceneId, oldName: s ? s.name : sceneId, newName: newName });
      saveSettingsChanges();
      settingsStatus.textContent = 'Kaydedildi: ' + sceneId + ' -> "' + newName + '"';
      pushHistory('sahne adı değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
      });
    });

    startButton.addEventListener('click', function() {
      var sceneId = startSceneSelect.value;
      if (!sceneId) return;
      var s = findSceneDataById(sceneId);
      var beforeSnapshot = settingsChanges.slice();
      settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'startScene'; });
      settingsChanges.push({ type: 'startScene', sceneId: sceneId, sceneName: s ? s.name : sceneId });
      saveSettingsChanges();
      settingsStatus.textContent = 'Varsayılan açılış sahnesi: ' + (s ? s.name : sceneId);
      pushHistory('varsayılan sahne değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
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
      saveSettingsChanges();
      pushHistory('iletişim bilgisi değiştirme', function() {
        settingsChanges = beforeSnapshot;
        saveSettingsChanges();
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
          settingsChanges = settingsChanges.filter(function(c) { return c.type !== 'contactBarPosition'; });
          settingsChanges.push({ type: 'contactBarPosition', right: right, bottom: bottom });
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
        marzipanoHotspot.destroy();
        sceneWrapperForUndo.editableHotspots = sceneWrapperForUndo.editableHotspots.filter(function(e) { return e !== newEditable; });
        arrows = arrows.filter(function(a) { return a !== arrowRecord; });
        saveArrows();
      });
    }

    function saveEdit() {
      if (!editingEntry) return;
      if (editingEntry.kind === 'info') {
        var newLink = linkInput.value.trim();
        if (!newLink) return;
        var oldSourceLink = editingEntry.rawData.sourceLink;
        var editRecord = {
          scene: currentSceneNumber,
          kind: 'info',
          oldTitle: editingEntry.rawData.title,
          newLink: newLink
        };
        edits.push(editRecord);
        saveEdits();
        // Live-remembered so re-opening this product for editing later in the
        // same session prefills the link instead of starting blank.
        editingEntry.rawData.sourceLink = newLink;
        coordsLine.textContent = 'Düzenleme kaydedildi: ' + editingEntry.rawData.title + ' -> yeni link';
        var editedInfoEntryRef = editingEntry;
        pushHistory('ürün düzenleme', function() {
          edits = edits.filter(function(e) { return e !== editRecord; });
          saveEdits();
          editedInfoEntryRef.rawData.sourceLink = oldSourceLink;
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
            removedEntry.hotspot.destroy();
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
            pushHistory('silme (' + removedEntry.label + ')', function() {
              var el = removedEntry.kind === 'link'
                ? createLinkHotspotElement(removedEntry.rawData)
                : createInfoHotspotElement(removedEntry.rawData, sceneWrapperForUndo.data.name);
              var restoredHotspot = sceneWrapperForUndo.scene.hotspotContainer().createHotspot(el, {
                yaw: removedEntry.rawData.yaw, pitch: removedEntry.rawData.pitch
              });
              sceneWrapperForUndo.editableHotspots.push({
                hotspot: restoredHotspot,
                kind: removedEntry.kind,
                label: removedEntry.label,
                rawData: removedEntry.rawData,
                ownRecord: removedEntry.ownRecord
              });
              if (removalRecord) {
                removals = removals.filter(function(r) { return r !== removalRecord; });
                saveRemovals();
              } else if (removedEntry.ownRecord) {
                arrows.push(removedEntry.ownRecord);
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
          } else if (c.type === 'sceneOrder') {
            lines.push('Yeni sahne sırası: ' + c.order.map(function(id) {
              var s = findSceneDataById(id);
              return s ? s.name.replace(/^\d+\.\s*/, '') : id;
            }).join(' -> '));
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
      updateUndoButton();
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
        if (draggedEntry.ownRecord) {
          // This hotspot was created earlier in this same session (e.g. a new
          // arrow) - update its own record instead of logging a separate move.
          draggedEntry.ownRecord.yaw = dragging.lastCoords.yaw;
          draggedEntry.ownRecord.pitch = dragging.lastCoords.pitch;
          saveArrows();
          coordsLine.textContent = 'Taşındı: ' + draggedEntry.label + '. Kaydedildi.';
          pushHistory('taşıma (' + draggedEntry.label + ')', function() {
            draggedEntry.hotspot.setPosition(startCoords);
            draggedEntry.ownRecord.yaw = startCoords.yaw;
            draggedEntry.ownRecord.pitch = startCoords.pitch;
            saveArrows();
          });
        } else {
          var moveRecord = {
            scene: currentSceneNumber,
            kind: draggedEntry.kind,
            label: draggedEntry.label,
            yaw: dragging.lastCoords.yaw,
            pitch: dragging.lastCoords.pitch
          };
          moves.push(moveRecord);
          saveMoves();
          coordsLine.textContent = 'Taşındı: ' + draggedEntry.label + '. Kaydedildi.';
          pushHistory('taşıma (' + draggedEntry.label + ')', function() {
            draggedEntry.hotspot.setPosition(startCoords);
            moves = moves.filter(function(m) { return m !== moveRecord; });
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
