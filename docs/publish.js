// Instant-publish: applies the admin panel's pending change records directly
// to docs/data.js on GitHub via the Contents API, so "Kaydet" actions can go
// live without routing through a manual copy/paste + Claude-edit + push cycle.
//
// Scope: only mutates docs/data.js (scenes, hotspots, settings). Four change
// types are intentionally left out and still require the old Kopyala flow:
//   - entries      (new products: only a raw link is captured, the title/
//                    description/image still need to be authored from it)
//   - newScenes    (bulk binary tile images, not a JSON edit)
//   - sceneOrder / deleteScene (would also need edits to index.html's static
//                    sidebar <a> list, not just data.js)
//   - contact      (index.html edit, not data.js; kept manual for now)
window.EnzaPublish = (function() {
  var OWNER = 'shadow-42-coder';
  var REPO = 'enza-manavgat-360';
  var BRANCH = 'master';
  var TOKEN_KEY = 'enzaGithubToken';
  var DATA_PATH = 'docs/data.js';

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try {
      if (t) window.localStorage.setItem(TOKEN_KEY, t);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function findSceneByIndex(data, oneBasedIndex) {
    return data.scenes[oneBasedIndex - 1] || null;
  }
  function findSceneById(data, id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) return data.scenes[i];
    }
    return null;
  }

  // Returns { arr, index } for exactly one match, or null if zero or more
  // than one hotspot matches - ambiguous/missing matches are never guessed,
  // the caller records a warning and leaves that one record unapplied.
  function findHotspot(scene, kind, matchFn) {
    var arr = kind === 'info' ? scene.infoHotspots : scene.linkHotspots;
    var matches = [];
    for (var i = 0; i < arr.length; i++) {
      if (matchFn(arr[i])) matches.push(i);
    }
    if (matches.length === 1) return { arr: arr, index: matches[0] };
    return null;
  }

  function linkLabel(target) { return 'Yön oku → ' + target; }

  var SKIPPED_SETTINGS_TYPES = { sceneOrder: true, deleteScene: true, contact: true };

  // Pure transform: deep-clones sourceData, applies every applicable pending
  // change record on top of it, and returns the result. Never mutates its
  // input. Anything it can't confidently apply is left alone and reported in
  // `warnings` so it can still be handled through the manual Kopyala flow.
  function applyChanges(sourceData, sets) {
    var data = JSON.parse(JSON.stringify(sourceData));
    var warnings = [];
    var appliedCounts = { arrows: 0, moves: 0, removals: 0, edits: 0, settingsChanges: 0 };

    (sets.arrows || []).forEach(function(a) {
      var scene = findSceneByIndex(data, a.scene);
      if (!scene) { warnings.push('Yeni ok eklenemedi: sahne bulunamadı (#' + a.scene + ')'); return; }
      scene.linkHotspots.push({ yaw: a.yaw, pitch: a.pitch, rotation: 0, target: a.targetScene });
      appliedCounts.arrows++;
    });

    (sets.moves || []).forEach(function(m) {
      var scene = findSceneByIndex(data, m.scene);
      if (!scene) { warnings.push('Taşıma uygulanamadı: sahne bulunamadı (#' + m.scene + ')'); return; }
      var found = findHotspot(scene, m.kind, function(h) {
        return m.kind === 'info' ? h.title === m.label : linkLabel(h.target) === m.label;
      });
      if (!found) { warnings.push('Taşıma uygulanamadı, elle kontrol gerekli: "' + m.label + '"'); return; }
      found.arr[found.index].yaw = m.yaw;
      found.arr[found.index].pitch = m.pitch;
      appliedCounts.moves++;
    });

    (sets.removals || []).forEach(function(r) {
      var scene = findSceneByIndex(data, r.scene);
      if (!scene) { warnings.push('Silme uygulanamadı: sahne bulunamadı (#' + r.scene + ')'); return; }
      var found = findHotspot(scene, r.kind, function(h) {
        return r.kind === 'info' ? h.title === r.label : linkLabel(h.target) === r.label;
      });
      if (!found) { warnings.push('Silme uygulanamadı, elle kontrol gerekli: "' + r.label + '"'); return; }
      found.arr.splice(found.index, 1);
      appliedCounts.removals++;
    });

    (sets.edits || []).forEach(function(e) {
      var scene = findSceneByIndex(data, e.scene);
      if (!scene) { warnings.push('Düzenleme uygulanamadı: sahne bulunamadı (#' + e.scene + ')'); return; }
      if (e.kind === 'info') {
        var foundInfo = findHotspot(scene, 'info', function(h) { return h.title === e.oldTitle; });
        if (!foundInfo) { warnings.push('Düzenleme uygulanamadı, elle kontrol gerekli: "' + e.oldTitle + '"'); return; }
        var hs = foundInfo.arr[foundInfo.index];
        if (e.newLink) hs.sourceLink = e.newLink;
        if (e.descChanged) hs.text = e.newDescHtml;
        appliedCounts.edits++;
      } else if (e.kind === 'badge') {
        var foundBadge = findHotspot(scene, 'info', function(h) { return h.title === e.title; });
        if (!foundBadge) { warnings.push('Rozet değişikliği uygulanamadı, elle kontrol gerekli: "' + e.title + '"'); return; }
        if (e.newBadge) foundBadge.arr[foundBadge.index].badge = e.newBadge;
        else delete foundBadge.arr[foundBadge.index].badge;
        appliedCounts.edits++;
      } else {
        var foundLink = findHotspot(scene, 'link', function(h) { return h.target === e.oldTarget; });
        if (!foundLink) { warnings.push('Ok hedefi değişikliği uygulanamadı, elle kontrol gerekli: "' + e.oldTarget + ' -> ' + e.newTarget + '"'); return; }
        foundLink.arr[foundLink.index].target = e.newTarget;
        appliedCounts.edits++;
      }
    });

    (sets.settingsChanges || []).forEach(function(c) {
      if (SKIPPED_SETTINGS_TYPES[c.type]) {
        warnings.push('"' + c.type + '" değişikliği hâlâ elle uygulanmalı (Kopyala metnini kullan).');
        return;
      }
      if (!data.settings) data.settings = {};
      if (c.type === 'rename') {
        var sRename = findSceneById(data, c.sceneId);
        if (sRename) { sRename.name = c.newName; appliedCounts.settingsChanges++; }
        else warnings.push('İsim değişikliği uygulanamadı: sahne bulunamadı (' + c.sceneId + ')');
      } else if (c.type === 'startScene') {
        var idx = data.scenes.findIndex(function(s) { return s.id === c.sceneId; });
        if (idx > 0) {
          var scn = data.scenes.splice(idx, 1)[0];
          data.scenes.unshift(scn);
          appliedCounts.settingsChanges++;
        } else if (idx === -1) {
          warnings.push('Varsayılan açılış sahnesi uygulanamadı: sahne bulunamadı (' + c.sceneId + ')');
        }
      } else if (c.type === 'openingView') {
        var sView = findSceneById(data, c.sceneId);
        if (sView) { sView.initialViewParameters = { yaw: c.yaw, pitch: c.pitch, fov: c.fov }; appliedCounts.settingsChanges++; }
        else warnings.push('Açılış görünümü uygulanamadı: sahne bulunamadı (' + c.sceneId + ')');
      } else if (c.type === 'kioskInterval') {
        data.settings.kioskIntervalSeconds = c.seconds;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'tukendiNotify') {
        data.settings.tukendiNotifyEnabled = c.enabled;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'campaignText') {
        data.settings.campaignText = c.text;
        if (c.endDate) data.settings.campaignEndDate = c.endDate;
        else delete data.settings.campaignEndDate;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'sceneTransition') {
        data.settings.sceneTransitionDuration = c.duration;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'featuredProduct') {
        data.settings.featuredProductEnabled = c.enabled;
        data.settings.featuredDailyPick = c.dailyPick;
        if (c.title) data.settings.featuredProductTitle = c.title;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'backgroundMusic') {
        data.settings.backgroundMusicEnabled = c.enabled;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'seasonalEffect') {
        data.settings.seasonalEffect = c.key;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'hotspotIconScale') {
        data.settings.hotspotIconScale = c.value;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'sceneVisibility') {
        var sHide = findSceneById(data, c.sceneId);
        if (sHide) {
          if (c.hidden) sHide.hidden = true; else delete sHide.hidden;
          appliedCounts.settingsChanges++;
        } else {
          warnings.push('Görünürlük değişikliği uygulanamadı: sahne bulunamadı (' + c.sceneId + ')');
        }
      } else if (c.type === 'presentationRoute') {
        data.settings.presentationRoute = c.route;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'moveProduct') {
        var src = findSceneById(data, c.sourceSceneId);
        var tgt = findSceneById(data, c.targetSceneId);
        if (!src || !tgt) { warnings.push('Ürün taşıma uygulanamadı: sahne bulunamadı'); return; }
        var foundProd = findHotspot(src, 'info', function(h) { return h.title === c.title; });
        if (!foundProd) { warnings.push('Ürün taşıma uygulanamadı, elle kontrol gerekli: "' + c.title + '"'); return; }
        var product = foundProd.arr.splice(foundProd.index, 1)[0];
        product.yaw = c.newYaw;
        product.pitch = c.newPitch;
        tgt.infoHotspots.push(product);
        appliedCounts.settingsChanges++;
      } else {
        warnings.push('Bilinmeyen ayar türü, elle kontrol gerekli: "' + c.type + '"');
      }
    });

    return { data: data, warnings: warnings, appliedCounts: appliedCounts };
  }

  function serialize(data) {
    return 'var APP_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
  }

  function b64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64DecodeUnicode(str) {
    return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
  }

  function githubRequest(method, path, body, token) {
    return fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(json) {
        if (!res.ok) {
          var err = new Error((json && json.message) || ('GitHub API hatası (HTTP ' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  // Fetches the live docs/data.js from GitHub (not the browser's in-memory
  // copy, which may be stale), applies every applicable pending change on
  // top of it, and commits the result back if anything actually changed.
  function publish(sets, opts) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('GitHub erişim anahtarı girilmemiş.'));
    return githubRequest('GET', '/contents/' + DATA_PATH + '?ref=' + BRANCH, null, token).then(function(fileInfo) {
      var currentContent = b64DecodeUnicode(fileInfo.content);
      var match = /^var APP_DATA = ([\s\S]*);\s*$/.exec(currentContent);
      if (!match) throw new Error('data.js formatı beklenmedik, yayınlama durduruldu (dosya elle değişmiş olabilir).');
      var currentData;
      try { currentData = JSON.parse(match[1]); }
      catch (e) { throw new Error('data.js ayrıştırılamadı, yayınlama durduruldu.'); }

      var result = applyChanges(currentData, sets);
      var newContent = serialize(result.data);
      if (newContent === currentContent) {
        return { committed: false, warnings: result.warnings, appliedCounts: result.appliedCounts };
      }
      return githubRequest('PUT', '/contents/' + DATA_PATH, {
        message: (opts && opts.message) || 'Yönetim panelinden otomatik yayın',
        content: b64EncodeUnicode(newContent),
        sha: fileInfo.sha,
        branch: BRANCH
      }, token).then(function(putResult) {
        return {
          committed: true,
          warnings: result.warnings,
          appliedCounts: result.appliedCounts,
          commitUrl: putResult.commit && putResult.commit.html_url
        };
      });
    });
  }

  return {
    getToken: getToken,
    setToken: setToken,
    applyChanges: applyChanges,
    serialize: serialize,
    publish: publish,
    SKIPPED_SETTINGS_TYPES: SKIPPED_SETTINGS_TYPES
  };
})();
