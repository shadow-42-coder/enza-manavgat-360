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
  function initSiteWidgets() {
    var c = getContact();
    var contactWrap = document.createElement('div');
    contactWrap.className = 'siteFloatingContact';
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
    renderSharedFooterContact: renderSharedFooterContact,
    renderHomeContent: renderHomeContent,
    renderAboutContent: renderAboutContent,
    renderFaqPage: renderFaqPage,
    initNav: initNav,
    initSiteWidgets: initSiteWidgets
  };
})();
