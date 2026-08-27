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

  return { renderBlogList: renderBlogList, renderBlogArticle: renderBlogArticle, renderPortfolioGrid: renderPortfolioGrid };
})();
