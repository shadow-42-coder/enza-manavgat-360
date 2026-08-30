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
    var filterRow = document.getElementById('blogFilterRow');
    if (!container) return;
    var posts = publishedBlogPosts();
    if (!posts.length) {
      container.innerHTML = '<p class="siteEmptyState">Henüz blog yazısı yok.</p>';
      return;
    }
    var categories = [];
    posts.forEach(function(p) { if (categories.indexOf(p.category) === -1) categories.push(p.category); });
    var activeCategory = null;

    function draw() {
      var visible = activeCategory ? posts.filter(function(p) { return p.category === activeCategory; }) : posts;
      container.innerHTML = visible.map(function(p) {
        return '<a class="blogCard revealOnScroll" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
          (p.image ? '<img class="blogCardImage" src="' + esc(p.image) + '" alt="" loading="lazy">' : '<div class="blogCardImage blogCardImagePlaceholder"></div>') +
          '<div class="blogCardBody">' +
          '<span class="blogCardCategory">' + esc(p.category) + '</span>' +
          '<h3 class="blogCardTitle">' + esc(p.title) + '</h3>' +
          '<p class="blogCardExcerpt">' + esc(p.excerpt) + '</p>' +
          '<span class="blogCardDate">' + esc(formatDate(p.date)) + '</span>' +
          '</div></a>';
      }).join('');
      initScrollReveal();
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

  function renderBlogArticle(slug) {
    var container = document.getElementById('blogArticle');
    if (!container) return;
    var allPosts = publishedBlogPosts();
    var post = allPosts.filter(function(p) { return p.slug === slug; })[0];
    if (!post) {
      container.innerHTML = '<p class="siteEmptyState">Yazı bulunamadı. <a href="blog.html">Tüm yazılara dönün</a>.</p>';
      return;
    }
    document.title = (post.seoTitle || post.title) + ' | enza HOME Manavgat';
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', post.seoDescription || post.excerpt || '');

    var related = allPosts.filter(function(p) { return p.slug !== slug && p.category === post.category; }).slice(0, 3);
    var relatedHtml = related.length ? (
      '<div class="blogRelated"><h2>Benzer Yazılar</h2><div class="blogGrid">' +
      related.map(function(p) {
        return '<a class="blogCard" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
          (p.image ? '<img class="blogCardImage" src="' + esc(p.image) + '" alt="" loading="lazy">' : '<div class="blogCardImage blogCardImagePlaceholder"></div>') +
          '<div class="blogCardBody">' +
          '<span class="blogCardCategory">' + esc(p.category) + '</span>' +
          '<h3 class="blogCardTitle">' + esc(p.title) + '</h3>' +
          '</div></a>';
      }).join('') + '</div></div>'
    ) : '';

    container.innerHTML =
      '<a class="sitePageBackLink" href="blog.html">← Tüm Yazılar</a>' +
      '<span class="blogCardCategory">' + esc(post.category) + '</span>' +
      '<h1 class="blogArticleTitle">' + esc(post.title) + '</h1>' +
      '<div class="blogArticleMeta">' + esc(formatDate(post.date)) + ' · enza HOME Manavgat</div>' +
      '<button type="button" class="blogShareButton" id="blogShareButton">Paylaş</button>' +
      (post.image ? '<img class="blogArticleImage" src="' + esc(post.image) + '" alt="" loading="eager">' : '') +
      '<div class="blogArticleBody">' + post.bodyHtml + '</div>' +
      relatedHtml;

    var shareButton = document.getElementById('blogShareButton');
    if (shareButton) {
      shareButton.addEventListener('click', function() {
        var url = window.location.href;
        if (navigator.share) {
          navigator.share({ title: post.title, text: post.excerpt || '', url: url }).catch(function() {});
        } else {
          window.open('https://wa.me/?text=' + encodeURIComponent(post.title + ' - ' + url), '_blank', 'noopener');
        }
      });
    }

    var ldJson = document.createElement('script');
    ldJson.type = 'application/ld+json';
    ldJson.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      datePublished: post.date,
      description: post.excerpt || '',
      image: post.image ? (new URL(post.image, window.location.href)).href : undefined,
      author: { '@type': 'Organization', name: 'enza HOME Manavgat' }
    });
    document.head.appendChild(ldJson);
    initScrollReveal();
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
      container.innerHTML = visible.map(function(it, i) {
        return '<div class="portfolioCard revealOnScroll" data-portfolio-i="' + i + '">' +
          (it.image ? '<img class="portfolioCardImage" src="' + esc(it.image) + '" alt="" loading="lazy">' : '<div class="portfolioCardImage portfolioCardImagePlaceholder"></div>') +
          '<div class="portfolioCardBody">' +
          '<span class="portfolioCardCategory">' + esc(it.category) + '</span>' +
          '<h3 class="portfolioCardTitle">' + esc(it.title) + '</h3>' +
          (it.caption ? '<p class="portfolioCardCaption">' + esc(it.caption) + '</p>' : '') +
          '</div></div>';
      }).join('');
      Array.prototype.forEach.call(container.querySelectorAll('[data-portfolio-i]'), function(card) {
        var it = visible[parseInt(card.dataset.portfolioI, 10)];
        var gallery = [];
        if (it.image) gallery.push(it.image);
        (it.images || []).forEach(function(src) { if (gallery.indexOf(src) === -1) gallery.push(src); });
        if (!gallery.length) return;
        card.addEventListener('click', function() { openLightbox(gallery, 0); });
      });
      initScrollReveal();
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
      return '<div class="campaignCard revealOnScroll">' +
        (c.image ? '<img class="campaignCardImage" src="' + esc(c.image) + '" alt="" loading="lazy">' : '<div class="campaignCardImage campaignCardImagePlaceholder"></div>') +
        '<div class="campaignCardBody">' +
        '<h3 class="campaignCardTitle">' + esc(c.title) + '</h3>' +
        '<p class="campaignCardDesc">' + esc(c.description) + '</p>' +
        (c.validUntil ? '<span class="campaignCardValidity">Geçerlilik: ' + esc(formatDate(c.validUntil)) + '</span>' : '') +
        '</div></div>';
    }).join('');
    initScrollReveal();
  }

  function publishedProducts() {
    var items = (window.APP_DATA && window.APP_DATA.products) || [];
    return items.filter(function(p) { return p.status === 'published'; });
  }

  // Kart rozetinde üst kategori yerine (ör. "Koltuklar") daha spesifik türü
  // göstermek için (ör. "Berjer") - başlıktan basit anahtar kelime eşleşmesi.
  // Filtreleme yine enzahome.com.tr'nin gerçek 10 üst kategorisine göre
  // yapılıyor (data.js'teki category alanı), bu sadece görünen etiket.
  var PRODUCT_TYPE_PATTERNS = [
    [/berjer/i, 'Berjer'], [/köşe takım/i, 'Köşe Takımı'], [/modüler/i, 'Köşe Takımı'],
    [/4('lü|\s*lu)\b/i, "4'lü Koltuk"], [/3('lü|\s*lu)\b/i, "3'lü Koltuk"], [/koltuk takım/i, 'Koltuk Takımı'],
    [/şifonyer/i, 'Şifonyer'], [/komodin/i, 'Komodin'], [/\bdolap\b/i, 'Dolap'],
    [/baza/i, 'Baza'], [/zigon sehpa/i, 'Zigon Sehpa'], [/orta sehpa/i, 'Sehpa'], [/\bsehpa\b/i, 'Sehpa'],
    [/kitaplık/i, 'Kitaplık'], [/tv ünites/i, 'TV Ünitesi'], [/\bmasa\b/i, 'Masa'],
    [/keson/i, 'Keson'], [/\bayna\b/i, 'Ayna'], [/duvar modül/i, 'Duvar Modülü'],
    [/karyola/i, 'Karyola'], [/oda takım/i, 'Oda Takımı'], [/çalışma masas/i, 'Çalışma Masası'],
    [/\byatak\b/i, 'Yatak'], [/uyku seti/i, 'Uyku Seti'], [/alt değiştirme/i, 'Bebek Ürünü'],
    [/havlu/i, 'Havlu'], [/pike/i, 'Pike'], [/çarşaf/i, 'Çarşaf'], [/nevresim/i, 'Nevresim'],
    [/\bhalı\b/i, 'Halı'], [/lambader/i, 'Lambader'], [/abajur/i, 'Abajur'], [/sarkıt/i, 'Sarkıt'],
    [/dekoratif obje/i, 'Dekoratif Obje'], [/tabak ve kase/i, 'Tabak & Kase'], [/\btablo\b/i, 'Tablo'],
    [/sandalye/i, 'Sandalye']
  ];
  function deriveProductType(title, category) {
    for (var i = 0; i < PRODUCT_TYPE_PATTERNS.length; i++) {
      if (PRODUCT_TYPE_PATTERNS[i][0].test(title)) return PRODUCT_TYPE_PATTERNS[i][1];
    }
    return category;
  }

  // Ürünler sayfası - kart üzerine gelince (veya dokununca) arkası dönen
  // flip-card ızgarası. Arka yüzde WhatsApp'tan sorma CTA'sı ve Sepete Ekle
  // var, fiyat gösterilmiyor (mağaza fiyatı online katalogdan farklı olabilir).
  // Katalog yüzlerce/binlerce ürüne çıkabildiği için (bkz. Ürünler admin
  // paneli) hepsini tek seferde DOM'a basmak tarayıcıyı yavaşlatır - bu
  // yüzden "Daha Fazla Göster" ile parça parça (PAGE_SIZE'lık) render edilir.
  var PRODUCT_PAGE_SIZE = 48;
  var PRODUCT_VARIANTS_VISIBLE = 6;
  function renderProductGrid() {
    var container = document.getElementById('productGrid');
    var filterRow = document.getElementById('productFilterRow');
    if (!container) return;
    var items = publishedProducts();
    if (!items.length) {
      container.innerHTML = '<p class="siteEmptyState">Henüz ürün eklenmedi.</p>';
      return;
    }
    var categories = [];
    items.forEach(function(p) { if (categories.indexOf(p.category) === -1) categories.push(p.category); });
    var activeCategory = null;
    var c = getContact();
    var visibleCount = PRODUCT_PAGE_SIZE;

    var countLabel = document.createElement('p');
    countLabel.className = 'productCountLabel';
    var loadMoreWrap = document.createElement('div');
    loadMoreWrap.className = 'productLoadMoreWrap';
    var loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'btnOutline';
    loadMoreBtn.textContent = 'Daha Fazla Göster';
    loadMoreBtn.addEventListener('click', function() {
      visibleCount += PRODUCT_PAGE_SIZE;
      draw();
    });
    loadMoreWrap.appendChild(loadMoreBtn);

    // Aynı üründe farklı renk/boy varsa (data.js: p.variants[]) enzahome.
    // com.tr'deki gibi tek kartta gösterilir - renk biliniyorsa küçük bir
    // renk noktası, sadece boy biliniyorsa (ör. halılar) metin etiketi.
    // Bir varyanta tıklamak sadece görseli değiştirir (flip'i tetiklemez);
    // fotoğrafa tıklamak flip yapıp Sepete Ekle/WhatsApp CTA'sını açar.
    function variantChipHtml(v, i) {
      if (v.colorHex) {
        return '<button type="button" class="productVariantSwatch' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '" style="background-color:' + v.colorHex + '" title="' + esc(v.colorName || v.label || '') + '"></button>';
      }
      var text = v.size || (v.label ? v.label.slice(0, 12) : String(i + 1));
      return '<button type="button" class="productVariantChip' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '" title="' + esc(v.label || '') + '">' + esc(text) + '</button>';
    }
    function variantFullTitle(p, v) {
      return v.label ? p.title + ' - ' + v.label : p.title;
    }
    function cardHtml(p) {
      var v0 = p.variants[0];
      return '<div class="productCard revealOnScroll" data-product-id="' + esc(p.id) + '" data-active-idx="0">' +
        '<div class="productCardInner">' +
        '<div class="productCardFace productCardFront">' +
        '<img src="' + esc(v0.image) + '" alt="' + esc(p.title) + '" loading="lazy">' +
        '<span class="productCardCategory">' + esc(deriveProductType(p.title, p.category)) + '</span>' +
        '</div>' +
        '<div class="productCardFace productCardBack">' +
        '<h3>' + esc(p.title) + '</h3>' +
        '<div class="productCardBackActions">' +
        '<button type="button" class="btnOutline productCardAddToCart">Sepete Ekle</button>' +
        '<a class="btnWarm productCardWhatsapp" target="_blank" rel="noopener">WhatsApp\'tan Sor</a>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<h3 class="productCardTitle">' + esc(p.title) + '</h3>' +
        (p.variants.length > 1 ? '<div class="productCardVariants">' +
          p.variants.map(function(v, i) { return (i >= PRODUCT_VARIANTS_VISIBLE ? '<span class="productVariantOverflow" hidden>' + variantChipHtml(v, i) + '</span>' : variantChipHtml(v, i)); }).join('') +
          (p.variants.length > PRODUCT_VARIANTS_VISIBLE ? '<button type="button" class="productVariantMoreBtn">+' + (p.variants.length - PRODUCT_VARIANTS_VISIBLE) + '</button>' : '') +
          '</div>' : '') +
        '</div>';
    }
    function wireCard(card, p) {
      var inner = card.querySelector('.productCardInner');
      var img = inner.querySelector('img');
      var waLink = inner.querySelector('.productCardWhatsapp');
      function activeVariant() { return p.variants[parseInt(card.dataset.activeIdx, 10)] || p.variants[0]; }
      function updateWaLink() {
        var v = activeVariant();
        waLink.href = 'https://wa.me/' + (c.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent('Merhaba, "' + variantFullTitle(p, v) + '" ürünü hakkında bilgi almak istiyorum.');
      }
      updateWaLink();
      inner.querySelector('.productCardFront').addEventListener('click', function() {
        inner.classList.toggle('flipped');
      });
      Array.prototype.forEach.call(card.querySelectorAll('.productVariantSwatch, .productVariantChip'), function(chip) {
        chip.addEventListener('click', function(e) {
          e.stopPropagation();
          var idx = chip.dataset.idx;
          card.dataset.activeIdx = idx;
          img.src = p.variants[idx].image;
          card.querySelectorAll('.productVariantSwatch, .productVariantChip').forEach(function(c2) { c2.classList.toggle('active', c2 === chip); });
          updateWaLink();
        });
      });
      card.querySelector('.productCardAddToCart').addEventListener('click', function(e) {
        e.stopPropagation();
        var v = activeVariant();
        addToCart({ id: p.id + ':' + v.sku, title: variantFullTitle(p, v) });
      });
      var moreBtn = card.querySelector('.productVariantMoreBtn');
      if (moreBtn) {
        moreBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          card.querySelectorAll('.productVariantOverflow').forEach(function(el) { el.hidden = false; });
          moreBtn.remove();
        });
      }
    }

    function draw() {
      var all = activeCategory ? items.filter(function(p) { return p.category === activeCategory; }) : items;
      var visible = all.slice(0, visibleCount);
      container.innerHTML = visible.map(cardHtml).join('');
      Array.prototype.forEach.call(container.querySelectorAll('.productCard'), function(card, i) { wireCard(card, visible[i]); });
      countLabel.textContent = visible.length + ' / ' + all.length + ' ürün gösteriliyor';
      loadMoreWrap.style.display = visible.length < all.length ? 'block' : 'none';
      initScrollReveal();
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
          visibleCount = PRODUCT_PAGE_SIZE;
          chips.forEach(function(ch) { ch.el.classList.toggle('active', ch.cat === cat); });
          draw();
        });
        filterRow.appendChild(chip);
        chips.push({ el: chip, cat: cat });
      }
      addChip('Tümü', null);
      categories.forEach(function(cat) { addChip(cat, cat); });
      chips[0].el.classList.add('active');
    }
    container.parentNode.insertBefore(countLabel, container);
    container.parentNode.insertBefore(loadMoreWrap, container.nextSibling);
    draw();
  }

  // Ana Sayfa'da kayan ürün fotoğrafları şeridi (enzahome.com.tr'deki gibi) -
  // saf CSS animasyonla, gerçek sayfa kaydırmasını hiç etkilemez. Liste iki
  // kez tekrarlanır ki döngü kesintisiz görünsün.
  // Katalog binlerce ürüne çıkabildiği için hepsini şeride basmak (özellikle
  // iki kez, kesintisiz döngü için) sayfa yüklenişini ciddi yavaşlatır -
  // rastgele bir örneklem yeterli, zaten şerit sürekli farklı ürünler
  // gösterme amacı taşımıyor, sadece "kayan fotoğraflar" hissi veriyor.
  var HOME_MARQUEE_SAMPLE_SIZE = 24;
  function renderHomeProductMarquee() {
    var container = document.getElementById('homeProductMarquee');
    if (!container) return;
    var all = publishedProducts();
    if (!all.length) { container.style.display = 'none'; return; }
    var items = all.length <= HOME_MARQUEE_SAMPLE_SIZE ? all : all.slice().sort(function() { return Math.random() - 0.5; }).slice(0, HOME_MARQUEE_SAMPLE_SIZE);
    var cardsHtml = items.map(function(p) {
      return '<a class="productMarqueeItem" href="urunler.html" title="' + esc(p.title) + '">' +
        '<img src="' + esc(p.variants[0].image) + '" alt="' + esc(p.title) + '" loading="lazy"></a>';
    }).join('');
    container.innerHTML = '<div class="productMarqueeTrack">' + cardsHtml + cardsHtml + '</div>';
  }

  // Ana Sayfa teasers - reuse the exact same filter/sort functions the list
  // pages use, just capped to a handful of items.
  function renderHomeBlogTeaser() {
    var container = document.getElementById('homeBlogTeaser');
    if (!container) return;
    var posts = publishedBlogPosts().slice(0, 3);
    if (!posts.length) { container.style.display = 'none'; return; }
    container.innerHTML = posts.map(function(p) {
      return '<a class="blogCard revealOnScroll" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
        (p.image ? '<img class="blogCardImage" src="' + esc(p.image) + '" alt="" loading="lazy">' : '<div class="blogCardImage blogCardImagePlaceholder"></div>') +
        '<div class="blogCardBody">' +
        '<span class="blogCardCategory">' + esc(p.category) + '</span>' +
        '<h3 class="blogCardTitle">' + esc(p.title) + '</h3>' +
        '<p class="blogCardExcerpt">' + esc(p.excerpt) + '</p>' +
        '</div></a>';
    }).join('');
    initScrollReveal();
  }
  function renderHomeCampaignTeaser() {
    var container = document.getElementById('homeCampaignTeaser');
    if (!container) return;
    var campaign = publishedCampaigns()[0];
    if (!campaign) { container.style.display = 'none'; return; }
    container.innerHTML = '<div class="homeCampaignBanner revealOnScroll">' +
      '<span class="sitePageEyebrow">KAMPANYA</span>' +
      '<h3 class="homeCampaignTeaserTitle">' + esc(campaign.title) + '</h3>' +
      '<p class="homeCampaignTeaserDesc">' + esc(campaign.description) + '</p>' +
      '<a class="btnWarm" href="kampanyalar.html">Tüm Kampanyalar</a>' +
      '</div>';
    initScrollReveal();
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

  // Ana Sayfa hero görsel karuseli - data.siteContent.heroImages boşsa
  // index.html'deki mevcut statik <img> hiç dokunulmadan kalır (geriye
  // dönük uyumlu); 1+ görsel varsa döngüsel bir karuseli JS ile üretir.
  function renderHeroCarousel(images) {
    var container = document.getElementById('homeHeroImage');
    if (!container || !images || !images.length) return;
    container.innerHTML = images.map(function(src, i) {
      return '<img class="homeHeroCarouselImg' + (i === 0 ? ' active' : '') + '" src="' + esc(src) + '" alt="enza HOME Manavgat" loading="' + (i === 0 ? 'eager' : 'lazy') + '">';
    }).join('') + (images.length > 1 ? '<div class="homeHeroCarouselDots">' + images.map(function(_, i) {
      return '<button type="button" class="homeHeroCarouselDot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" aria-label="Görsel ' + (i + 1) + '"></button>';
    }).join('') + '</div>' : '');
    if (images.length <= 1) return;
    var imgs = container.querySelectorAll('.homeHeroCarouselImg');
    var dots = container.querySelectorAll('.homeHeroCarouselDot');
    var current = 0;
    function show(i) {
      current = i;
      imgs.forEach(function(img, idx) { img.classList.toggle('active', idx === i); });
      dots.forEach(function(dot, idx) { dot.classList.toggle('active', idx === i); });
    }
    dots.forEach(function(dot) {
      dot.addEventListener('click', function() { show(parseInt(dot.dataset.i, 10)); });
    });
    setInterval(function() { show((current + 1) % imgs.length); }, 5000);
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
        return '<div class="homeValueProp revealOnScroll"><h3>' + esc(vp.title) + '</h3><p>' + esc(vp.desc) + '</p></div>';
      }).join('');
    }
    renderHeroCarousel(sc.heroImages);
    initScrollReveal();
  }

  // "Öne Çıkan Ürün" - turdaki mevcut data.settings.featuredProductEnabled /
  // featuredProductTitle ayarlarını kullanır (yeni bir alan icat edilmedi);
  // etkin değilse bölüm tamamen gizlenir.
  function renderHomeFeaturedProduct() {
    var container = document.getElementById('homeFeaturedProduct');
    if (!container) return;
    var settings = (window.APP_DATA && window.APP_DATA.settings) || {};
    if (!settings.featuredProductEnabled || !settings.featuredProductTitle) {
      container.style.display = 'none';
      return;
    }
    container.innerHTML = '<div class="homeFeaturedCard revealOnScroll">' +
      '<span class="sitePageEyebrow">ÖNE ÇIKAN ÜRÜN</span>' +
      '<h3 class="homeFeaturedCardTitle">' + esc(settings.featuredProductTitle) + '</h3>' +
      '<a class="btnWarm" href="tur.html">360° Turda Gör</a>' +
      '</div>';
    initScrollReveal();
  }

  function publishedTestimonials() {
    var items = (window.APP_DATA && window.APP_DATA.testimonials) || [];
    return items.filter(function(t) { return t.status === 'published'; })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  // Ana Sayfa'daki Yorumlar bölümü - yayınlanmış hiç yorum yoksa (ki sahte
  // yorum asla otomatik eklenmediği için yeni bir sitede başlangıçta hep
  // öyledir) bölüm tamamen gizlenir, boş bir "henüz yorum yok" göstermez.
  function renderTestimonials() {
    var container = document.getElementById('homeTestimonials');
    if (!container) return;
    var items = publishedTestimonials();
    if (!items.length) { container.style.display = 'none'; return; }
    container.innerHTML = '<div class="homeSectionHeader"><div><span class="sitePageEyebrow">MÜŞTERİLERİMİZ NE DİYOR</span><h2>Yorumlar</h2></div></div>' +
      '<div class="testimonialGrid">' + items.map(function(t) {
        return '<div class="testimonialCard revealOnScroll">' +
          '<div class="testimonialStars">' + '★'.repeat(t.rating || 5) + '</div>' +
          '<p class="testimonialQuote">"' + esc(t.quote) + '"</p>' +
          '<span class="testimonialName">' + esc(t.name) + '</span>' +
          (t.role ? '<span class="testimonialRole">' + esc(t.role) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
    initScrollReveal();
  }

  function renderAboutContent() {
    var sc = (window.APP_DATA && window.APP_DATA.siteContent) || {};
    var titleEl = document.getElementById('aboutTitle');
    var textEl = document.getElementById('aboutText');
    if (titleEl && sc.aboutTitle) titleEl.textContent = sc.aboutTitle;
    if (textEl && sc.aboutText) textEl.textContent = sc.aboutText;

    var listEl = document.getElementById('aboutContactList');
    var c = getContact();
    if (listEl) {
      var rows = [];
      if (c.address) rows.push('<a class="contactInfoRow" href="' + esc(c.mapsLink) + '" target="_blank" rel="noopener">' + esc(c.address) + '</a>');
      if (c.phone1) rows.push('<a class="contactInfoRow" href="' + telHref(c.phone1) + '">' + esc(c.phone1) + '</a>');
      if (c.phone2) rows.push('<a class="contactInfoRow" href="' + telHref(c.phone2) + '">' + esc(c.phone2) + '</a>');
      if (c.whatsapp) rows.push('<a class="contactInfoRow" href="' + waHref(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp\'tan Yazın</a>');
      if (c.instagram) rows.push('<a class="contactInfoRow" href="https://www.instagram.com/' + esc(c.instagram) + '/" target="_blank" rel="noopener">@' + esc(c.instagram) + '</a>');
      if (c.mapsLink) rows.push('<a class="contactInfoRow" href="' + esc(c.mapsLink) + '" target="_blank" rel="noopener">Google Haritada Gör</a>');
      listEl.innerHTML = rows.join('');
    }

    // Google Haritalar API anahtarı gerektirmeyen basit gömme - adresten
    // doğrudan bir arama sorgusu üretir.
    var mapEl = document.getElementById('aboutMapEmbed');
    if (mapEl && c.address) {
      mapEl.innerHTML = '<iframe src="https://www.google.com/maps?q=' + encodeURIComponent(c.address) +
        '&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mağaza konumu"></iframe>';
    }
  }

  // SSS - yalnızca sitede zaten gerçek olarak var olan bilgilere dayanır
  // (mağaza adresi, ücretsiz mimari projelendirme, Yataş güvencesi, vb.);
  // çalışma saatleri/teslimat/taksit gibi bilgi verilmeyen konular hiç
  // eklenmez, uydurulmaz.
  function renderFaqPage() {
    var container = document.getElementById('faqList');
    if (!container) return;
    var c = getContact();
    var items = [
      {
        q: 'Mağazanız nerede?',
        a: c.address + ' adresinde bulunuyoruz.' + (c.mapsLink ? ' Google Haritalar üzerinden yol tarifi alabilirsiniz.' : '')
      },
      {
        q: 'Önce ürünleri incelemek istiyorum, mağazaya gitmeden bakabilir miyim?',
        a: '360° sanal turumuzla mağazamızı evinizden adım adım gezebilir, ürünleri inceledikten sonra dilerseniz mağazamızı ziyaret edebilirsiniz.'
      },
      {
        q: 'Ürün siparişi veya bilgi almak için nasıl ulaşabilirim?',
        a: 'WhatsApp veya telefon üzerinden bize ulaşabilirsiniz; size en kısa sürede dönüş yapıyoruz.'
      },
      {
        q: 'Mimari projelendirme hizmeti ücretli mi?',
        a: 'Hayır, evinize özel ölçü ve yerleşim planı için mimari projelendirme hizmetimiz ücretsizdir.'
      },
      {
        q: 'Ürünleriniz hangi marka güvencesiyle satılıyor?',
        a: "Türkiye'nin köklü markası Yataş'ın enza HOME koleksiyonlarını, kalite ve garanti standartlarıyla sunuyoruz."
      },
      {
        q: 'Sosyal medyadan sizi nasıl takip edebilirim?',
        a: c.instagram ? ('Instagram\'da @' + c.instagram + ' hesabımızdan güncel ürün ve kampanyalarımızı takip edebilirsiniz.') : 'Instagram hesabımızdan güncel ürün ve kampanyalarımızı takip edebilirsiniz.'
      },
      {
        q: 'Blog ve Portfolyo sayfalarında ne buluyorum?',
        a: "Blog'da mobilya ve dekorasyon fikirlerini, Portfolyo'da ise müşterilerimizin evlerine hazırladığımız render ve tasarım örneklerini paylaşıyoruz."
      }
    ];
    container.innerHTML = items.map(function(item) {
      return '<div class="faqItem revealOnScroll"><h3>' + esc(item.q) + '</h3><p>' + esc(item.a) + '</p></div>';
    }).join('');
    initScrollReveal();
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

  // Scroll-reveal: any element with .revealOnScroll gets .revealed added the
  // first time it enters the viewport. Called again after every dynamic
  // render (grids are rebuilt with fresh elements each time), so it always
  // re-observes only the elements not already marked revealed.
  var revealObserver = null;
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.revealOnScroll').forEach(function(el) { el.classList.add('revealed'); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
    }
    document.querySelectorAll('.revealOnScroll:not(.revealed)').forEach(function(el) { revealObserver.observe(el); });
  }

  // Portfolyo lightbox - built lazily on first use, shared by every card.
  var lightboxEl = null;
  function buildLightbox() {
    if (lightboxEl) return lightboxEl;
    var overlay = document.createElement('div');
    overlay.className = 'siteLightboxOverlay';
    overlay.innerHTML =
      '<button type="button" class="siteLightboxClose" aria-label="Kapat">×</button>' +
      '<button type="button" class="siteLightboxNav prev" aria-label="Önceki görsel">‹</button>' +
      '<img class="siteLightboxImage" alt="">' +
      '<button type="button" class="siteLightboxNav next" aria-label="Sonraki görsel">›</button>';
    document.body.appendChild(overlay);
    var img = overlay.querySelector('.siteLightboxImage');
    var prevBtn = overlay.querySelector('.prev');
    var nextBtn = overlay.querySelector('.next');
    var gallery = [];
    var index = 0;
    function show() {
      img.src = gallery[index];
      var multi = gallery.length > 1;
      prevBtn.style.display = multi ? 'flex' : 'none';
      nextBtn.style.display = multi ? 'flex' : 'none';
    }
    function close() { overlay.classList.remove('open'); }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    overlay.querySelector('.siteLightboxClose').addEventListener('click', close);
    prevBtn.addEventListener('click', function() { index = (index - 1 + gallery.length) % gallery.length; show(); });
    nextBtn.addEventListener('click', function() { index = (index + 1) % gallery.length; show(); });
    document.addEventListener('keydown', function(e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prevBtn.click();
      else if (e.key === 'ArrowRight') nextBtn.click();
    });
    lightboxEl = {
      open: function(g, startIndex) {
        gallery = g;
        index = startIndex || 0;
        show();
        overlay.classList.add('open');
      }
    };
    return lightboxEl;
  }
  function openLightbox(gallery, startIndex) {
    buildLightbox().open(gallery, startIndex);
  }

  // Kalıcı yüzen iletişim kümesi (WhatsApp + Ara) + yukarı kaydır butonu -
  // her yeni sayfa için tek bir çağrıyla eklenir (initNav() gibi).
  // Sepet - "sepete atıp tek seferde fiyat sorma" isteği. Sunucusuz, tamamen
  // localStorage'da tutulur (bu sitenin geri kalanı gibi); "Gönder" tek bir
  // WhatsApp mesajında tüm seçili ürünleri listeler. Fiyat hesaplamaz -
  // mağaza fiyatı verir, burası sadece hangi ürünlerin sorulacağını toplar.
  var CART_KEY = 'enzaCart';
  function getCart() {
    try { return JSON.parse(window.localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCart(cart) {
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
    updateCartBadge();
  }
  function addToCart(product) {
    var cart = getCart();
    if (cart.some(function(item) { return item.id === product.id; })) {
      openCartPanel();
      return;
    }
    cart.push(product);
    saveCart(cart);
    openCartPanel();
  }
  function removeFromCart(id) {
    saveCart(getCart().filter(function(item) { return item.id !== id; }));
    renderCartPanelItems();
  }
  var cartBadgeEl = null;
  function updateCartBadge() {
    if (!cartBadgeEl) return;
    var count = getCart().length;
    cartBadgeEl.textContent = String(count);
    cartBadgeEl.style.display = count ? 'flex' : 'none';
  }

  var cartPanelEl = null;
  function buildCartPanel() {
    if (cartPanelEl) return cartPanelEl;
    var overlay = document.createElement('div');
    overlay.className = 'siteCartOverlay';
    overlay.innerHTML =
      '<div class="siteCartPanel">' +
      '<div class="siteCartPanelHeader"><h3>Sepetim</h3><button type="button" class="siteCartClose" aria-label="Kapat">×</button></div>' +
      '<div class="siteCartItems"></div>' +
      '<div class="siteCartActions">' +
      '<button type="button" class="btnOutline siteCartClearBtn">Sepeti Temizle</button>' +
      '<a class="btnWarm siteCartSendBtn" target="_blank" rel="noopener">WhatsApp\'tan Fiyat Sor</a>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeCartPanel(); });
    overlay.querySelector('.siteCartClose').addEventListener('click', closeCartPanel);
    overlay.querySelector('.siteCartClearBtn').addEventListener('click', function() {
      if (!getCart().length) return;
      if (!window.confirm('Sepetteki tüm ürünler kaldırılsın mı?')) return;
      saveCart([]);
      renderCartPanelItems();
    });
    cartPanelEl = overlay;
    return overlay;
  }
  function renderCartPanelItems() {
    var overlay = buildCartPanel();
    var itemsEl = overlay.querySelector('.siteCartItems');
    var cart = getCart();
    if (!cart.length) {
      itemsEl.innerHTML = '<p class="siteEmptyState">Sepetiniz boş. Ürünler sayfasından beğendiğiniz ürünleri "Sepete Ekle" ile buraya ekleyebilirsiniz.</p>';
    } else {
      itemsEl.innerHTML = cart.map(function(item) {
        return '<div class="siteCartItem"><span>' + esc(item.title) + '</span><button type="button" class="siteCartItemRemove" data-id="' + esc(item.id) + '" aria-label="Kaldır">×</button></div>';
      }).join('');
      Array.prototype.forEach.call(itemsEl.querySelectorAll('.siteCartItemRemove'), function(btn) {
        btn.addEventListener('click', function() { removeFromCart(btn.dataset.id); });
      });
    }
    var c = getContact();
    var sendBtn = overlay.querySelector('.siteCartSendBtn');
    if (cart.length) {
      var lines = cart.map(function(item, i) { return (i + 1) + '. ' + item.title; }).join('\n');
      var text = 'Merhaba, aşağıdaki ürünler hakkında fiyat ve stok bilgisi almak istiyorum:\n' + lines;
      sendBtn.href = 'https://wa.me/' + (c.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
      sendBtn.style.pointerEvents = '';
      sendBtn.style.opacity = '';
    } else {
      sendBtn.href = 'javascript:void(0)';
      sendBtn.style.pointerEvents = 'none';
      sendBtn.style.opacity = '0.5';
    }
  }
  function openCartPanel() {
    renderCartPanelItems();
    buildCartPanel().classList.add('open');
  }
  function closeCartPanel() {
    if (cartPanelEl) cartPanelEl.classList.remove('open');
  }

  function initSiteWidgets() {
    var c = getContact();
    var contactWrap = document.createElement('div');
    contactWrap.className = 'siteFloatingContact';
    var cartBtn = document.createElement('button');
    cartBtn.type = 'button';
    cartBtn.className = 'siteFloatingContactBtn cart';
    cartBtn.setAttribute('aria-label', 'Sepetim');
    cartBadgeEl = document.createElement('span');
    cartBadgeEl.className = 'siteCartBadge';
    cartBtn.appendChild(cartBadgeEl);
    cartBtn.addEventListener('click', openCartPanel);
    contactWrap.appendChild(cartBtn);
    updateCartBadge();
    if (c.whatsapp) {
      var wa = document.createElement('a');
      wa.href = waHref(c.whatsapp);
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.className = 'siteFloatingContactBtn whatsapp';
      wa.setAttribute('aria-label', "WhatsApp'tan Yaz");
      contactWrap.appendChild(wa);
    }
    if (c.phone1) {
      var call = document.createElement('a');
      call.href = telHref(c.phone1);
      call.className = 'siteFloatingContactBtn call';
      call.setAttribute('aria-label', 'Ara: ' + c.phone1);
      contactWrap.appendChild(call);
    }
    document.body.appendChild(contactWrap);

    var scrollTopBtn = document.createElement('button');
    scrollTopBtn.type = 'button';
    scrollTopBtn.className = 'siteScrollTopButton';
    scrollTopBtn.setAttribute('aria-label', 'Yukarı çık');
    scrollTopBtn.textContent = '↑';
    scrollTopBtn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(scrollTopBtn);
    window.addEventListener('scroll', function() {
      scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
    });
  }

  return {
    renderBlogList: renderBlogList,
    renderBlogArticle: renderBlogArticle,
    renderPortfolioGrid: renderPortfolioGrid,
    renderCampaignGrid: renderCampaignGrid,
    renderHomeBlogTeaser: renderHomeBlogTeaser,
    renderHomeCampaignTeaser: renderHomeCampaignTeaser,
    renderHomeFeaturedProduct: renderHomeFeaturedProduct,
    renderTestimonials: renderTestimonials,
    renderProductGrid: renderProductGrid,
    renderHomeProductMarquee: renderHomeProductMarquee,
    renderSharedFooterContact: renderSharedFooterContact,
    renderHomeContent: renderHomeContent,
    renderAboutContent: renderAboutContent,
    renderFaqPage: renderFaqPage,
    initNav: initNav,
    initSiteWidgets: initSiteWidgets
  };
})();
