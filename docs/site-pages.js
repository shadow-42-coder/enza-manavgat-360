// Renders the public Blog and Portfolyo pages from APP_DATA.blogPosts /
// APP_DATA.portfolioItems - deliberately separate from index.js, which is
// exclusively the Marzipano tour + admin panel engine and has nothing to do
// with rendering ordinary document content. Only status === 'published'
// items ever appear here; drafts stay visible solely inside the admin panel.
window.SitePages = (function() {
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function formatDate(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    var d = parseInt(parts[2], 10), m = parseInt(parts[1], 10) - 1, y = parts[0];
    return d + ' ' + (MONTHS[m] || '') + ' ' + y;
  }

  function publishedBlogPosts() {
    var posts = (window.APP_DATA && window.APP_DATA.blogPosts) || [];
    return posts.filter(function(p) { return p.status === 'published'; })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }
  function publishedPortfolioItems() {
    var items = (window.APP_DATA && window.APP_DATA.portfolioItems) || [];
    return items.filter(function(p) { return p.status === 'published'; })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function publishedCampaigns() {
    var today = todayIso();
    var items = (window.APP_DATA && window.APP_DATA.campaigns) || [];
    return items.filter(function(c) { return c.status === 'published' && (!c.validUntil || c.validUntil >= today); })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  function renderBlogList() {
    var container = document.getElementById('blogListGrid');
    if (!container) return;
    var posts = publishedBlogPosts();
    if (!posts.length) {
      container.innerHTML = '<p class="siteEmptyState">Henüz blog yazısı yok.</p>';
      return;
    }
    container.innerHTML = posts.map(function(p) {
      return '<a class="blogCard" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
        (p.image ? '<img class="blogCardImage" src="' + esc(p.image) + '" alt="">' : '<div class="blogCardImage blogCardImagePlaceholder"></div>') +
        '<div class="blogCardBody">' +
        '<span class="blogCardCategory">' + esc(p.category) + '</span>' +
        '<h3 class="blogCardTitle">' + esc(p.title) + '</h3>' +
        '<p class="blogCardExcerpt">' + esc(p.excerpt) + '</p>' +
        '<span class="blogCardDate">' + esc(formatDate(p.date)) + '</span>' +
        '</div></a>';
    }).join('');
  }

  function renderBlogArticle(slug) {
    var container = document.getElementById('blogArticle');
    if (!container) return;
    var post = publishedBlogPosts().filter(function(p) { return p.slug === slug; })[0];
    if (!post) {
      container.innerHTML = '<p class="siteEmptyState">Yazı bulunamadı. <a href="blog.html">Tüm yazılara dönün</a>.</p>';
      return;
    }
    document.title = (post.seoTitle || post.title) + ' | enza HOME Manavgat';
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', post.seoDescription || post.excerpt || '');
    container.innerHTML =
      '<a class="sitePageBackLink" href="blog.html">← Tüm Yazılar</a>' +
      '<span class="blogCardCategory">' + esc(post.category) + '</span>' +
      '<h1 class="blogArticleTitle">' + esc(post.title) + '</h1>' +
      '<div class="blogArticleMeta">' + esc(formatDate(post.date)) + ' · enza HOME Manavgat</div>' +
      (post.image ? '<img class="blogArticleImage" src="' + esc(post.image) + '" alt="">' : '') +
      '<div class="blogArticleBody">' + post.bodyHtml + '</div>';
  }

  function renderPortfolioGrid() {
    var container = document.getElementById('portfolioGrid');
    var filterRow = document.getElementById('portfolioFilterRow');
    if (!container) return;
    var items = publishedPortfolioItems();
    if (!items.length) {
      container.innerHTML = '<p class="siteEmptyState">Henüz portfolyo öğesi yok.</p>';
      return;
    }
    var categories = [];
    items.forEach(function(it) { if (categories.indexOf(it.category) === -1) categories.push(it.category); });
    var activeCategory = null;

    function draw() {
      var visible = activeCategory ? items.filter(function(it) { return it.category === activeCategory; }) : items;
      container.innerHTML = visible.map(function(it) {
        return '<div class="portfolioCard">' +
          (it.image ? '<img class="portfolioCardImage" src="' + esc(it.image) + '" alt="">' : '<div class="portfolioCardImage portfolioCardImagePlaceholder"></div>') +
          '<div class="portfolioCardBody">' +
          '<span class="portfolioCardCategory">' + esc(it.category) + '</span>' +
          '<h3 class="portfolioCardTitle">' + esc(it.title) + '</h3>' +
          (it.caption ? '<p class="portfolioCardCaption">' + esc(it.caption) + '</p>' : '') +
          '</div></div>';
      }).join('');
    }

    if (filterRow && categories.length > 1) {
      var chips = [];
      function addChip(label, cat) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'portfolioFilterChip' + (cat === activeCategory ? ' active' : '');
        chip.textContent = label;
        chip.addEventListener('click', function() {
          activeCategory = cat;
          chips.forEach(function(c) { c.el.classList.toggle('active', c.cat === cat); });
          draw();
        });
        filterRow.appendChild(chip);
        chips.push({ el: chip, cat: cat });
      }
      addChip('Tümü', null);
      categories.forEach(function(cat) { addChip(cat, cat); });
      chips[0].el.classList.add('active');
    }
    draw();
  }

  function renderCampaignGrid() {
    var container = document.getElementById('campaignGrid');
    if (!container) return;
    var items = publishedCampaigns();
    if (!items.length) {
      container.innerHTML = '<p class="siteEmptyState">Şu anda aktif bir kampanya yok.</p>';
      return;
    }
    container.innerHTML = items.map(function(c) {
      return '<div class="campaignCard">' +
        (c.image ? '<img class="campaignCardImage" src="' + esc(c.image) + '" alt="">' : '<div class="campaignCardImage campaignCardImagePlaceholder"></div>') +
        '<div class="campaignCardBody">' +
        '<h3 class="campaignCardTitle">' + esc(c.title) + '</h3>' +
        '<p class="campaignCardDesc">' + esc(c.description) + '</p>' +
        (c.validUntil ? '<span class="campaignCardValidity">Geçerlilik: ' + esc(formatDate(c.validUntil)) + '</span>' : '') +
        '</div></div>';
    }).join('');
  }

  // Ana Sayfa teasers - reuse the exact same filter/sort functions the list
  // pages use, just capped to a handful of items.
  function renderHomeBlogTeaser() {
    var container = document.getElementById('homeBlogTeaser');
    if (!container) return;
    var posts = publishedBlogPosts().slice(0, 3);
    if (!posts.length) { container.style.display = 'none'; return; }
    container.innerHTML = posts.map(function(p) {
      return '<a class="blogCard" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
        (p.image ? '<img class="blogCardImage" src="' + esc(p.image) + '" alt="">' : '<div class="blogCardImage blogCardImagePlaceholder"></div>') +
        '<div class="blogCardBody">' +
        '<span class="blogCardCategory">' + esc(p.category) + '</span>' +
        '<h3 class="blogCardTitle">' + esc(p.title) + '</h3>' +
        '<p class="blogCardExcerpt">' + esc(p.excerpt) + '</p>' +
        '</div></a>';
    }).join('');
  }
  function renderHomeCampaignTeaser() {
    var container = document.getElementById('homeCampaignTeaser');
    if (!container) return;
    var campaign = publishedCampaigns()[0];
    if (!campaign) { container.style.display = 'none'; return; }
    container.innerHTML = '<div class="homeCampaignBanner">' +
      '<span class="sitePageEyebrow">KAMPANYA</span>' +
      '<h3 class="homeCampaignTeaserTitle">' + esc(campaign.title) + '</h3>' +
      '<p class="homeCampaignTeaserDesc">' + esc(campaign.description) + '</p>' +
      '<a class="btnWarm" href="kampanyalar.html">Tüm Kampanyalar</a>' +
      '</div>';
  }

  // Single source of truth for contact info, shared by the footer, the
  // Hakkımızda page, and (indirectly, via publish.js) the tour's own
  // HTML-patched footer - see docs/publish.js's 'contact' settingsChange
  // handling. Falls back to the real published values so a page never
  // shows blank contact info before the admin has ever touched this.
  function getContact() {
    var c = (window.APP_DATA && window.APP_DATA.settings && window.APP_DATA.settings.contact) || {};
    return {
      phone1: c.phone1 || '0549 332 07 07',
      phone2: c.phone2 || '0242 777 12 12',
      instagram: c.instagram || 'yatasenzahomemanavgat',
      mapsLink: c.mapsLink || 'https://maps.google.com/?cid=5104403785270368674',
      whatsapp: c.whatsapp || '+905493320707',
      address: c.address || ''
    };
  }
  function telHref(display) {
    var digits = (display || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.charAt(0) === '0') digits = digits.slice(1);
    if (digits.indexOf('90') !== 0) digits = '90' + digits;
    return 'tel:+' + digits;
  }
  var WHATSAPP_DEFAULT_TEXT = 'Merhaba, enza HOME Manavgat web sitesi hakkında bilgi almak istiyorum.';
  function waHref(whatsapp) {
    return 'https://wa.me/' + (whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(WHATSAPP_DEFAULT_TEXT);
  }

  function renderSharedFooterContact() {
    var container = document.getElementById('sitePageFooterContact');
    if (!container) return;
    var c = getContact();
    var parts = [];
    if (c.phone1) parts.push('<a href="' + telHref(c.phone1) + '">' + esc(c.phone1) + '</a>');
    if (c.phone2) parts.push('<a href="' + telHref(c.phone2) + '">' + esc(c.phone2) + '</a>');
    if (c.instagram) parts.push('<a href="https://www.instagram.com/' + esc(c.instagram) + '/" target="_blank" rel="noopener">Instagram</a>');
    if (c.mapsLink) parts.push('<a href="' + esc(c.mapsLink) + '" target="_blank" rel="noopener">Google Haritada Gör</a>');
    if (c.whatsapp) parts.push('<a href="' + waHref(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp\'tan Yaz</a>');
    container.innerHTML = parts.join('');
  }

  function renderHomeContent() {
    var sc = (window.APP_DATA && window.APP_DATA.siteContent) || {};
    var eyebrow = document.getElementById('homeHeroEyebrow');
    var title = document.getElementById('homeHeroTitle');
    var subtitle = document.getElementById('homeHeroSubtitle');
    if (eyebrow && sc.heroEyebrow) eyebrow.textContent = sc.heroEyebrow;
    if (title && sc.heroTitle) title.textContent = sc.heroTitle;
    if (subtitle && sc.heroSubtitle) subtitle.textContent = sc.heroSubtitle;
    var vpContainer = document.getElementById('homeValueProps');
    if (vpContainer && sc.valueProps && sc.valueProps.length) {
      vpContainer.innerHTML = sc.valueProps.map(function(vp) {
        return '<div class="homeValueProp"><h3>' + esc(vp.title) + '</h3><p>' + esc(vp.desc) + '</p></div>';
      }).join('');
    }
  }

  function renderAboutContent() {
    var sc = (window.APP_DATA && window.APP_DATA.siteContent) || {};
    var titleEl = document.getElementById('aboutTitle');
    var textEl = document.getElementById('aboutText');
    if (titleEl && sc.aboutTitle) titleEl.textContent = sc.aboutTitle;
    if (textEl && sc.aboutText) textEl.textContent = sc.aboutText;

    var listEl = document.getElementById('aboutContactList');
    if (listEl) {
      var c = getContact();
      var rows = [];
      if (c.address) rows.push('<a class="contactInfoRow" href="' + esc(c.mapsLink) + '" target="_blank" rel="noopener">' + esc(c.address) + '</a>');
      if (c.phone1) rows.push('<a class="contactInfoRow" href="' + telHref(c.phone1) + '">' + esc(c.phone1) + '</a>');
      if (c.phone2) rows.push('<a class="contactInfoRow" href="' + telHref(c.phone2) + '">' + esc(c.phone2) + '</a>');
      if (c.whatsapp) rows.push('<a class="contactInfoRow" href="' + waHref(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp\'tan Yazın</a>');
      if (c.instagram) rows.push('<a class="contactInfoRow" href="https://www.instagram.com/' + esc(c.instagram) + '/" target="_blank" rel="noopener">@' + esc(c.instagram) + '</a>');
      if (c.mapsLink) rows.push('<a class="contactInfoRow" href="' + esc(c.mapsLink) + '" target="_blank" rel="noopener">Google Haritada Gör</a>');
      listEl.innerHTML = rows.join('');
    }
  }

  // Shared hamburger nav toggle - one function, called from a one-line
  // inline <script> on every public page, so the open/close logic lives in
  // exactly one place rather than being copy-pasted five times.
  function initNav() {
    var header = document.querySelector('.sitePageHeader');
    if (!header) return;
    var toggle = header.querySelector('.sitePageNavToggle');
    var nav = header.querySelector('.sitePageNav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function() {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  return {
    renderBlogList: renderBlogList,
    renderBlogArticle: renderBlogArticle,
    renderPortfolioGrid: renderPortfolioGrid,
    renderCampaignGrid: renderCampaignGrid,
    renderHomeBlogTeaser: renderHomeBlogTeaser,
    renderHomeCampaignTeaser: renderHomeCampaignTeaser,
    renderSharedFooterContact: renderSharedFooterContact,
    renderHomeContent: renderHomeContent,
    renderAboutContent: renderAboutContent,
    initNav: initNav
  };
})();
