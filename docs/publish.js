// Instant-publish: applies the admin panel's pending change records directly
// to docs/data.js (and, for a few settings types, docs/tur.html - the 360
// tour's own HTML, not the marketing homepage) on GitHub via the Contents
// API, so "Kaydet" actions can go live without routing through a manual
// copy/paste + Claude-edit + push cycle.
//
// Scope: two change types are still left out and require the old Kopyala
// flow:
//   - entries   (new products: only a raw link is captured, the title/
//                description/image still need to be authored from it)
//   - newScenes (bulk binary tile images, not a JSON/HTML edit)
window.EnzaPublish = (function() {
  var OWNER = 'shadow-42-coder';
  var REPO = 'enza-manavgat-360';
  var BRANCH = 'master';
  var TOKEN_KEY = 'enzaGithubToken';
  var DATA_PATH = 'docs/data.js';
  var HTML_PATH = 'docs/tur.html';
  var IMG_BLOG_DIR = 'docs/img/blog';
  var IMG_PORTFOLIO_DIR = 'docs/img/portfolio';
  var IMG_CAMPAIGN_DIR = 'docs/img/campaigns';

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

  var SKIPPED_SETTINGS_TYPES = {};

  // Pure transform: deep-clones sourceData, applies every applicable pending
  // change record on top of it, and returns the result. Never mutates its
  // input. Anything it can't confidently apply is left alone and reported in
  // `warnings` so it can still be handled through the manual Kopyala flow.
  //
  // A few settings types (contact, sceneOrder, deleteScene) also need a
  // tur.html edit, not just data.js - those are collected into
  // `htmlOps` for publish() to apply separately, rather than handled here.
  function applyChanges(sourceData, sets) {
    var data = JSON.parse(JSON.stringify(sourceData));
    var warnings = [];
    var appliedCounts = { arrows: 0, moves: 0, removals: 0, edits: 0, settingsChanges: 0, blogPosts: 0, portfolioItems: 0, campaigns: 0 };
    var htmlOps = { contact: null, sceneOrder: null, deletedSceneIds: [] };

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
      if (!data.settings) data.settings = {};
      if (c.type === 'contact') {
        htmlOps.contact = { phone1: c.phone1, phone2: c.phone2, instagram: c.instagram, mapsLink: c.mapsLink };
        // Also keep a structured copy in data.settings.contact - this is
        // the only place tur.html's contact info was ever recorded before
        // (only baked into its HTML via the regex patch above), so the new
        // public pages (which read data.js, not tur.html's markup) had
        // nothing to read. One save now updates both.
        data.settings.contact = {
          phone1: c.phone1, phone2: c.phone2, instagram: c.instagram,
          mapsLink: c.mapsLink, whatsapp: c.whatsapp, address: c.address
        };
        appliedCounts.settingsChanges++;
      } else if (c.type === 'siteContent') {
        data.siteContent = c.content;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'categories') {
        if (c.key !== 'blogCategories' && c.key !== 'portfolioCategories') {
          warnings.push('Bilinmeyen kategori listesi, elle kontrol gerekli: "' + c.key + '"');
          return;
        }
        data.settings[c.key] = c.list;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'sceneOrder') {
        htmlOps.sceneOrder = c.order;
        appliedCounts.settingsChanges++;
      } else if (c.type === 'deleteScene') {
        var idxDel = data.scenes.findIndex(function(s) { return s.id === c.sceneId; });
        if (idxDel === -1) { warnings.push('Sahne silinemedi: sahne bulunamadı (' + c.sceneId + ')'); return; }
        data.scenes.splice(idxDel, 1);
        // Any arrow in ANY remaining scene that pointed at the deleted
        // scene would now link nowhere, so it has to go too.
        data.scenes.forEach(function(s) {
          s.linkHotspots = s.linkHotspots.filter(function(h) { return h.target !== c.sceneId; });
        });
        htmlOps.deletedSceneIds.push(c.sceneId);
        appliedCounts.settingsChanges++;
      } else if (c.type === 'rename') {
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

    // Blog posts and portfolio items are authored whole (title/description/
    // image already attached by the admin form itself), unlike `entries`
    // (a bare product link still needing content written by hand) - so
    // these go straight through instant-publish instead of the manual
    // Kopyala flow. Each pending record is a self-describing op, matched
    // by its own stable `id` (not by index/title, which can change).
    if (!data.blogPosts) data.blogPosts = [];
    (sets.blogPosts || []).forEach(function(p) {
      if (p.op === 'add') {
        data.blogPosts.push(p.record);
        appliedCounts.blogPosts++;
      } else if (p.op === 'edit') {
        var blogIdx = data.blogPosts.findIndex(function(x) { return x.id === p.id; });
        if (blogIdx === -1) { warnings.push('Blog yazısı güncellenemedi, bulunamadı: ' + p.id); return; }
        data.blogPosts[blogIdx] = p.record;
        appliedCounts.blogPosts++;
      } else if (p.op === 'remove') {
        var blogBefore = data.blogPosts.length;
        data.blogPosts = data.blogPosts.filter(function(x) { return x.id !== p.id; });
        if (data.blogPosts.length === blogBefore) { warnings.push('Blog yazısı silinemedi, bulunamadı: ' + p.id); return; }
        appliedCounts.blogPosts++;
      }
    });

    if (!data.portfolioItems) data.portfolioItems = [];
    (sets.portfolioItems || []).forEach(function(p) {
      if (p.op === 'add') {
        data.portfolioItems.push(p.record);
        appliedCounts.portfolioItems++;
      } else if (p.op === 'edit') {
        var portIdx = data.portfolioItems.findIndex(function(x) { return x.id === p.id; });
        if (portIdx === -1) { warnings.push('Portfolyo öğesi güncellenemedi, bulunamadı: ' + p.id); return; }
        data.portfolioItems[portIdx] = p.record;
        appliedCounts.portfolioItems++;
      } else if (p.op === 'remove') {
        var portBefore = data.portfolioItems.length;
        data.portfolioItems = data.portfolioItems.filter(function(x) { return x.id !== p.id; });
        if (data.portfolioItems.length === portBefore) { warnings.push('Portfolyo öğesi silinemedi, bulunamadı: ' + p.id); return; }
        appliedCounts.portfolioItems++;
      }
    });

    if (!data.campaigns) data.campaigns = [];
    (sets.campaigns || []).forEach(function(p) {
      if (p.op === 'add') {
        data.campaigns.push(p.record);
        appliedCounts.campaigns++;
      } else if (p.op === 'edit') {
        var campIdx = data.campaigns.findIndex(function(x) { return x.id === p.id; });
        if (campIdx === -1) { warnings.push('Kampanya güncellenemedi, bulunamadı: ' + p.id); return; }
        data.campaigns[campIdx] = p.record;
        appliedCounts.campaigns++;
      } else if (p.op === 'remove') {
        var campBefore = data.campaigns.length;
        data.campaigns = data.campaigns.filter(function(x) { return x.id !== p.id; });
        if (data.campaigns.length === campBefore) { warnings.push('Kampanya silinemedi, bulunamadı: ' + p.id); return; }
        appliedCounts.campaigns++;
      }
    });

    return { data: data, warnings: warnings, appliedCounts: appliedCounts, htmlOps: htmlOps };
  }

  function serialize(data) {
    return 'var APP_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
  }

  function normalizePhoneIntl(raw) {
    var digits = (raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.charAt(0) === '0') digits = digits.slice(1);
    if (digits.indexOf('90') !== 0) digits = '90' + digits;
    return '+' + digits;
  }
  function formatPhoneDisplay(intlPhone) {
    var d = intlPhone.replace('+90', '0').replace(/\D/g, '');
    if (d.length !== 11) return intlPhone;
    return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9, 11);
  }

  // Rewrites hrefs (and, for phone numbers, the visible display text/title
  // too) inside one HTML fragment - called once for #sceneListFooter and
  // once for #contactBar, since both contain their own independent copies
  // of the same contact links.
  function patchContactBlock(blockHtml, contact) {
    var tel1 = normalizePhoneIntl(contact.phone1);
    var tel2 = contact.phone2 ? normalizePhoneIntl(contact.phone2) : null;
    var tel1Display = tel1 ? formatPhoneDisplay(tel1) : null;
    var tel2Display = tel2 ? formatPhoneDisplay(tel2) : null;
    var waNum = tel1.replace('+', '');
    var igHandle = (contact.instagram || '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/+$/, '');
    var igUrl = igHandle ? 'https://www.instagram.com/' + igHandle + '/' : null;

    var out = blockHtml;
    if (contact.mapsLink) {
      out = out.replace(/href="https:\/\/maps\.google\.com\/[^"]*"/, 'href="' + contact.mapsLink + '"');
    }
    if (igUrl) {
      out = out.replace(/href="https:\/\/(www\.)?instagram\.com\/[^"]*"/, 'href="' + igUrl + '"');
    }
    if (waNum) {
      out = out.replace(/wa\.me\/\d+/, 'wa.me/' + waNum);
    }
    var telCount = 0;
    out = out.replace(/<a\b[^>]*href="tel:[^"]*"[^>]*>([\s\S]*?)<\/a>/g, function(fullTag, innerText) {
      telCount++;
      var newTel = telCount === 1 ? tel1 : (telCount === 2 ? tel2 : null);
      var newDisplay = telCount === 1 ? tel1Display : (telCount === 2 ? tel2Display : null);
      if (!newTel) return fullTag;
      var tag = fullTag.replace(/href="tel:[^"]*"/, 'href="tel:' + newTel + '"');
      tag = tag.replace(/title="[^"]*"/, 'title="' + newDisplay + '"');
      if (/^[0-9() +-]+$/.test(innerText.trim())) {
        tag = tag.replace(/>([\s\S]*?)<\/a>$/, '>' + newDisplay + '</a>');
      }
      return tag;
    });
    return out;
  }

  function patchIndexHtmlContact(html, contact) {
    var out = html;
    out = out.replace(/(<div id="sceneListFooter">)([\s\S]*?)(<\/div>)/, function(m, open, inner, close) {
      return open + patchContactBlock(inner, contact) + close;
    });
    out = out.replace(/(<div id="contactBar">)([\s\S]*?)(<\/div>)/, function(m, open, inner, close) {
      return open + patchContactBlock(inner, contact) + close;
    });
    return out;
  }

  function extractSceneEntries(ulInnerHtml) {
    var re = /<a href="javascript:void\(0\)" class="scene" data-id="([^"]+)">[\s\S]*?<\/a>/g;
    var entries = [];
    var m;
    while ((m = re.exec(ulInnerHtml))) entries.push({ id: m[1], html: m[0] });
    return entries;
  }

  // Applies a deleteScene and/or sceneOrder edit to the static sidebar
  // <a class="scene"> list, which - unlike everything else in data.js -
  // isn't rendered from data at runtime, so removing/reordering a scene
  // there means literally rewriting these list items.
  function patchIndexHtmlSceneList(html, deletedSceneIds, order) {
    return html.replace(/(<ul class="scenes">)([\s\S]*?)(<\/ul>)/, function(m, open, inner, close) {
      var entries = extractSceneEntries(inner);
      if (deletedSceneIds && deletedSceneIds.length) {
        entries = entries.filter(function(e) { return deletedSceneIds.indexOf(e.id) === -1; });
      }
      if (order && order.length) {
        var byId = {};
        entries.forEach(function(e) { byId[e.id] = e; });
        var reordered = order.map(function(id) { return byId[id]; }).filter(Boolean);
        // Anything not mentioned in the order (shouldn't normally happen)
        // is kept, appended at the end, rather than silently dropped.
        var mentioned = {};
        order.forEach(function(id) { mentioned[id] = true; });
        entries.forEach(function(e) { if (!mentioned[e.id]) reordered.push(e); });
        entries = reordered;
      }
      var rebuilt = entries.map(function(e) { return '      ' + e.html; }).join('\n\n');
      return open + '\n' + rebuilt + '\n\n  ' + close;
    });
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
  // A few settings types (contact, sceneOrder, deleteScene) also need
  // docs/tur.html edited - that happens as a second, separate commit
  // right after, only if there's actually a tur.html change pending.
  function publish(sets, opts) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('GitHub erişim anahtarı girilmemiş.'));
    var dataResult;
    var dataCommitted = false;
    var dataCommitUrl = null;

    return githubRequest('GET', '/contents/' + DATA_PATH + '?ref=' + BRANCH, null, token).then(function(fileInfo) {
      var currentContent = b64DecodeUnicode(fileInfo.content);
      var match = /^var APP_DATA = ([\s\S]*);\s*$/.exec(currentContent);
      if (!match) throw new Error('data.js formatı beklenmedik, yayınlama durduruldu (dosya elle değişmiş olabilir).');
      var currentData;
      try { currentData = JSON.parse(match[1]); }
      catch (e) { throw new Error('data.js ayrıştırılamadı, yayınlama durduruldu.'); }

      dataResult = applyChanges(currentData, sets);
      var newContent = serialize(dataResult.data);
      if (newContent === currentContent) return null;
      return githubRequest('PUT', '/contents/' + DATA_PATH, {
        message: (opts && opts.message) || 'Yönetim panelinden otomatik yayın',
        content: b64EncodeUnicode(newContent),
        sha: fileInfo.sha,
        branch: BRANCH
      }, token);
    }).then(function(putResult) {
      if (putResult) {
        dataCommitted = true;
        dataCommitUrl = putResult.commit && putResult.commit.html_url;
      }
      var htmlOps = dataResult.htmlOps;
      var needsHtml = !!(htmlOps.contact || htmlOps.sceneOrder || htmlOps.deletedSceneIds.length);
      if (!needsHtml) return null;
      return githubRequest('GET', '/contents/' + HTML_PATH + '?ref=' + BRANCH, null, token).then(function(htmlFileInfo) {
        var currentHtml = b64DecodeUnicode(htmlFileInfo.content);
        var newHtml = currentHtml;
        if (htmlOps.contact) newHtml = patchIndexHtmlContact(newHtml, htmlOps.contact);
        if (htmlOps.sceneOrder || htmlOps.deletedSceneIds.length) {
          newHtml = patchIndexHtmlSceneList(newHtml, htmlOps.deletedSceneIds, htmlOps.sceneOrder);
        }
        if (newHtml === currentHtml) return null;
        return githubRequest('PUT', '/contents/' + HTML_PATH, {
          message: (opts && opts.message) || 'Yönetim panelinden otomatik yayın (tur.html)',
          content: b64EncodeUnicode(newHtml),
          sha: htmlFileInfo.sha,
          branch: BRANCH
        }, token);
      });
    }).then(function(htmlPutResult) {
      return {
        committed: dataCommitted || !!htmlPutResult,
        warnings: dataResult.warnings,
        appliedCounts: dataResult.appliedCounts,
        commitUrl: dataCommitUrl,
        htmlCommitUrl: htmlPutResult ? (htmlPutResult.commit && htmlPutResult.commit.html_url) : null
      };
    });
  }

  // Reads a File as base64, stripping the "data:...;base64," prefix
  // FileReader.readAsDataURL adds - githubRequest's JSON body needs the
  // raw base64 the Contents API expects, not a data: URI.
  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function() { reject(new Error('Dosya okunamadı.')); };
      reader.readAsDataURL(file);
    });
  }

  // Commits one image file straight to the repo as a brand-new path - no
  // `sha` needed (only required when overwriting an existing file), and
  // the timestamp-prefixed filename means collisions can't happen. Used
  // for blog/portfolio "featured image" uploads: the image goes live the
  // moment it's dropped, well before the surrounding post/item is actually
  // published - only the short returned path then rides along in that
  // pending record.
  function uploadImage(file, folder) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('GitHub erişim anahtarı girilmemiş.'));
    var dir = folder === 'portfolio' ? IMG_PORTFOLIO_DIR : (folder === 'campaign' ? IMG_CAMPAIGN_DIR : IMG_BLOG_DIR);
    return fileToBase64(file).then(function(base64) {
      var safeName = Date.now() + '-' + file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
      return githubRequest('PUT', '/contents/' + dir + '/' + safeName, {
        message: 'Yönetim panelinden görsel yükleme: ' + safeName,
        content: base64,
        branch: BRANCH
      }, token).then(function(result) {
        return {
          path: 'img/' + folder + '/' + safeName,
          commitUrl: result.commit && result.commit.html_url
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
    uploadImage: uploadImage,
    patchIndexHtmlContact: patchIndexHtmlContact,
    patchIndexHtmlSceneList: patchIndexHtmlSceneList,
    SKIPPED_SETTINGS_TYPES: SKIPPED_SETTINGS_TYPES
  };
})();
