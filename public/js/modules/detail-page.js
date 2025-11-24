/**
 * 详情页管理器
 * 负责加载和渲染详情页内容
 */

class DetailPageManager {
  constructor() {
    this.currentTool = null;
    this.relatedTools = [];
    this.tableId = null;
    this.SESSION_CACHE_KEY = 'navsite_selected_tool';
    this.SESSION_CACHE_DURATION = 5 * 60 * 1000; // 5分钟会话缓存
    this.init();
  }

  async init() {
    const params = new URLSearchParams(window.location.search);
    const toolId = params.get('id');
    const toolName = params.get('name');
    const toolUrl = params.get('url');
    const queryTableId = params.get('table_id');
    this.tableId = queryTableId && queryTableId !== 'null' ? queryTableId : null;

    // 等待app.js加载完成
    await this.waitForAppInit();

    if (!toolId && !toolName) {
      // 如果没有参数，使用mock数据
      this.currentTool = this.getMockData();
      if (this.currentTool) {
        await this.renderDetail();
        this.bindEvents();
        this.initSidebar();
        this.bindFloatingActions();
        return;
      }
      this.showError('缺少必要的参数');
      return;
    }

    // 加载模块
    await this.loadModules();

    // 初始化主题管理器（如果app.js没有初始化）
    if (!window.themeManager && window.ThemeManager) {
      this.themeManager = new window.ThemeManager();
      window.themeManager = this.themeManager;
    } else if (window.themeManager) {
      this.themeManager = window.themeManager;
    }

    // 加载详情数据
    await this.loadDetailData(toolId, toolName, toolUrl);

    // 绑定事件
    this.bindEvents();
    
    // 初始化侧边栏
    this.initSidebar();
    
    // 绑定浮动按钮
    this.bindFloatingActions();
  }

  async waitForAppInit() {
    // 等待app.js初始化完成
    let attempts = 0;
    const maxAttempts = 50;
    while (attempts < maxAttempts) {
      if (window.dataManager && window.uiRenderer) {
        if (this.tableId && window.dataManager.getCurrentTableId && window.dataManager.getCurrentTableId() !== this.tableId) {
          window.dataManager.setTableId(this.tableId);
        }
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }

  async loadModules() {
    const basePath = window.BASE_PATH || '';
    const modules = [
      `${basePath}/js/modules/core/theme-manager.js`,
      `${basePath}/js/modules/core/data-manager.js`
    ];

    return Promise.all(
      modules.map(src => {
        return new Promise((resolve, reject) => {
          // 检查是否已加载
          const existingScript = document.querySelector(`script[src="${src}"]`);
          if (existingScript) {
            resolve();
            return;
          }
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = () => {
            console.warn(`Failed to load module: ${src}`);
            resolve(); // 即使失败也继续，避免阻塞
          };
          document.head.appendChild(script);
        });
      })
    );
  }

  async loadDetailData(toolId, toolName, toolUrl) {
    try {
      // 获取URL参数
      const params = new URLSearchParams(window.location.search);
      const decodedToolName = toolName ? decodeURIComponent(toolName) : '';
      const cachedTool = this.getCachedToolFromSession(toolId, decodedToolName);
      let renderedFromCache = false;
      
      if (cachedTool) {
        this.currentTool = cachedTool;
        await this.renderDetail();
        renderedFromCache = true;
      }
      
      // 如果有dataManager，从数据中查找
      if (window.dataManager) {
        await this.ensureTableContext();
        const toolFromManager = await this.findToolViaDataManager(toolId, decodedToolName);
        if (toolFromManager) {
          const needRerender = !renderedFromCache || !this.isSameTool(this.currentTool, toolFromManager);
          this.currentTool = toolFromManager;
          this.cacheToolForSession(this.currentTool);
          if (needRerender) {
            await this.renderDetail();
          }
          return;
        }
      }

      // 如果dataManager中没有找到，尝试直接从API获取
      if (toolId) {
        const apiTool = await this.fetchToolFromApi(toolId, this.tableId);
        if (apiTool) {
          this.currentTool = apiTool;
          this.cacheToolForSession(this.currentTool);
          await this.renderDetail();
          return;
        }
      }

      // 如果找不到，使用URL参数创建临时工具对象
      if (toolName && toolUrl) {
        const tempTool = {
          id: toolId || `mock_${Date.now()}`,
          name: decodedToolName,
          url: decodeURIComponent(toolUrl),
          description: params.get('description') ? decodeURIComponent(params.get('description')) : '',
          category: params.get('category') ? decodeURIComponent(params.get('category')) : '',
          fullDescription: params.get('fullDescription') ? decodeURIComponent(params.get('fullDescription')) : '',
          tableId: this.tableId || ''
        };
        this.currentTool = tempTool;
        this.cacheToolForSession(this.currentTool);
        await this.renderDetail();
      } else {
        // 使用mock数据
        this.currentTool = this.getMockData();
        if (this.currentTool) {
          this.cacheToolForSession(this.currentTool);
          await this.renderDetail();
        } else {
          this.showError('无法加载详情数据');
        }
      }
    } catch (error) {
      console.error('加载详情数据失败:', error);
      // 使用mock数据作为后备
      this.currentTool = this.getMockData();
      if (this.currentTool) {
        this.cacheToolForSession(this.currentTool);
        await this.renderDetail();
      } else {
        this.showError('加载详情数据失败');
      }
    }
  }

  async ensureTableContext() {
    if (this.tableId && window.dataManager && window.dataManager.getCurrentTableId && window.dataManager.getCurrentTableId() !== this.tableId) {
      window.dataManager.setTableId(this.tableId);
    }
  }

  async ensureNavigationDataLoaded(forceRefresh = false) {
    if (!window.dataManager) return null;
    if (!forceRefresh && window.dataManager.hasData && window.dataManager.hasData()) {
      return window.dataManager.getCurrentData().navigationData;
    }
    const result = await window.dataManager.fetchNavigationData(forceRefresh);
    return result && result.data ? result.data : window.dataManager.getCurrentData().navigationData;
  }

  async findToolViaDataManager(toolId, toolName) {
    if (!window.dataManager) return null;
    let navigationData = await this.ensureNavigationDataLoaded(false);
    let matched = this.lookupTool(navigationData, toolId, toolName);

    if (!matched) {
      navigationData = await this.ensureNavigationDataLoaded(true);
      matched = this.lookupTool(navigationData, toolId, toolName);
    }

    if (matched) {
      return this.normalizeTool(matched.tool, matched.category);
    }
    return null;
  }

  lookupTool(navigationData = {}, toolId, toolName) {
    if (!navigationData) return null;
    for (const category in navigationData) {
      const tools = navigationData[category] || [];
      const match = tools.find(item => {
        if (toolId) return item.id === toolId;
        if (toolName) return item.name === toolName;
        return false;
      });
      if (match) {
        return { tool: match, category };
      }
    }
    return null;
  }

  normalizeTool(tool, category) {
    if (!tool) return null;
    return {
      ...tool,
      category: tool.category || category || '',
      tableId: tool.tableId || this.tableId || (window.dataManager && window.dataManager.getCurrentTableId ? window.dataManager.getCurrentTableId() : '')
    };
  }

  getCachedToolFromSession(toolId, toolName) {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    try {
      const cache = sessionStorage.getItem(this.SESSION_CACHE_KEY);
      if (!cache) return null;
      const parsed = JSON.parse(cache);
      if (!parsed || !parsed.tool || !parsed.timestamp) return null;
      if (Date.now() - parsed.timestamp > this.SESSION_CACHE_DURATION) {
        sessionStorage.removeItem(this.SESSION_CACHE_KEY);
        return null;
      }
      if (toolId && parsed.tool.id === toolId) return parsed.tool;
      if (!toolId && toolName && parsed.tool.name === toolName) return parsed.tool;
      return null;
    } catch (error) {
      console.warn('读取详情会话缓存失败:', error);
      return null;
    }
  }

  cacheToolForSession(tool) {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    if (!tool) return;
    try {
      sessionStorage.setItem(this.SESSION_CACHE_KEY, JSON.stringify({
        tool,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('写入详情会话缓存失败:', error);
    }
  }

  isSameTool(source, target) {
    if (!source || !target) return false;
    return (
      source.id === target.id &&
      source.name === target.name &&
      source.url === target.url &&
      (source.description || '') === (target.description || '') &&
      (source.category || '') === (target.category || '')
    );
  }

  async fetchToolFromApi(toolId, tableId = null) {
    try {
      if (!toolId) return null;
      const basePath = window.BASE_PATH || '';
      let apiUrl = `${basePath}/api/navigation`;
      if (tableId) {
        apiUrl += `?table_id=${encodeURIComponent(tableId)}`;
      }
      const response = await fetch(apiUrl, { cache: 'no-store' });
      if (!response.ok) {
        console.warn('直接请求详情数据失败:', response.status, response.statusText);
        return null;
      }
      const result = await response.json();
      if (!result.success || !result.data) {
        return null;
      }
      for (const category in result.data) {
        const match = result.data[category].find(item => item.id === toolId);
        if (match) {
          return {
            ...match,
            category: match.category || category,
            tableId: match.tableId || tableId || ''
          };
        }
      }
      return null;
    } catch (error) {
      console.error('直接从API获取详情失败:', error);
      return null;
    }
  }

  getMockData() {
    // Mock数据
    return {
      id: 'mock_001',
      name: '示例网站',
      url: 'https://www.example.com',
      description: '这是一个示例网站的描述信息，展示了网站的主要功能和特点。',
      category: '工具',
      fullDescription: `
        <h3>网站详细介绍</h3>
        <p>这是一个示例网站的详细介绍内容。这里可以包含网站的功能、特色、使用方法等信息。</p>
        <h4>主要功能</h4>
        <ul>
          <li>功能一：提供强大的工具支持</li>
          <li>功能二：简洁易用的界面设计</li>
          <li>功能三：快速响应的服务体验</li>
        </ul>
        <h4>使用说明</h4>
        <p>使用本网站非常简单，只需要按照提示操作即可。如有问题，欢迎通过游客反馈功能联系我们。</p>
      `,
      icon: 'https://www.google.com/s2/favicons?domain=example.com&sz=64',
      tableId: this.tableId || 'tbl3I3RtxgtiC7eF'
    };
  }

  async renderDetail() {
    if (!this.currentTool) return;

    // 渲染介绍卡片
    this.renderIntroCard();

    // 加载并渲染走马灯广告
    this.renderCarouselAds();

    // 渲染详细介绍
    this.renderFullDescription();

    // 加载并渲染相关导航
    await this.loadRelatedNavs();

    // 加载并渲染广告
    this.renderAds();

    // 加载评论
    this.loadComments();
  }

  renderIntroCard() {
    const tool = this.currentTool;

    // 设置图标
    const iconEl = document.getElementById('detail-icon');
    const iconTextEl = document.getElementById('detail-icon-text');
    if (tool.icon) {
      if (tool.icon.startsWith('http')) {
        iconEl.src = tool.icon;
        iconEl.style.display = 'block';
      }
    } else {
      // 尝试获取favicon
      const faviconUrl = this.getFaviconUrl(tool.url);
      if (faviconUrl) {
        iconEl.src = faviconUrl;
        iconEl.style.display = 'block';
      } else {
        // 使用文字图标
        iconEl.style.display = 'none';
        const textIcon = document.querySelector('.intro-icon .text-icon');
        if (textIcon) {
          textIcon.style.display = 'flex';
          if (iconTextEl) {
            iconTextEl.textContent = tool.name ? tool.name.charAt(0).toUpperCase() : '网';
          }
        }
      }
    }

    // 设置标题
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = tool.name || '未知网站';

    // 设置描述
    const descEl = document.getElementById('detail-description');
    if (descEl) descEl.textContent = tool.description || '暂无描述';

    // 设置标签
    const tagsEl = document.getElementById('detail-tags');
    if (tagsEl) {
      tagsEl.innerHTML = '';
      if (tool.category) {
        const tag = document.createElement('a');
        tag.className = 'intro-tag';
        tag.href = `index.html?category=${encodeURIComponent(tool.category)}`;
        tag.innerHTML = `<span>${tool.category}</span> <i class="bi bi-link-45deg"></i>`;
        tagsEl.appendChild(tag);
      }
    }

    // 设置直达链接
    const directLinkEl = document.getElementById('detail-direct-link');
    if (directLinkEl) {
      const url = this.getToolUrl(tool);
      directLinkEl.href = url;
    }
  }

  renderCarouselAds() {
    const container = document.getElementById('carousel-ads');
    if (!container) return;

    // 示例广告数据（实际应该从服务器获取）
    const ads = [
      {
        title: '免费一键AI生图',
        description: '快速生成高质量图片',
        image: 'https://via.placeholder.com/280x200?text=AI生图',
        link: '#'
      },
      {
        title: '快速文生AI视频',
        description: '文本转视频工具',
        image: 'https://via.placeholder.com/280x200?text=AI视频',
        link: '#'
      },
      {
        title: '抠图/放大/去水印',
        description: '图片处理工具',
        image: 'https://via.placeholder.com/280x200?text=图片处理',
        link: '#'
      },
      {
        title: 'AI电商/模特换脸',
        description: 'AI换脸工具',
        image: 'https://via.placeholder.com/280x200?text=AI换脸',
        link: '#'
      },
      {
        title: '海报资源素材',
        description: '设计素材库',
        image: 'https://via.placeholder.com/280x200?text=设计素材',
        link: '#'
      }
    ];

    const loopAds = ads.length > 1 ? ads.concat(ads) : ads;
    container.innerHTML = '';
    const track = document.createElement('div');
    track.className = 'carousel-ads-track';
    loopAds.forEach(ad => {
      track.appendChild(this.createAdCard(ad));
    });
    container.appendChild(track);
  }

  createAdCard(ad) {
    const card = document.createElement('div');
    card.className = 'carousel-ad-card';
    card.innerHTML = `
      <img src="${ad.image}" alt="${ad.title}" onerror="this.style.display='none';">
      <div class="ad-overlay">
        <div class="ad-title">${ad.title}</div>
        <div class="ad-desc">${ad.description}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (ad.link && ad.link !== '#') {
        window.open(ad.link, '_blank');
      }
    });
    return card;
  }

  renderFullDescription() {
    const container = document.getElementById('detail-full-description');
    if (!container) return;

    const tool = this.currentTool;
    let html = '';
    delete container.dataset.descriptionSource;

    if (tool.fullDescription && String(tool.fullDescription).trim()) {
      html = tool.fullDescription;
      container.dataset.descriptionSource = 'bitable';
    } else if (tool.description && String(tool.description).trim()) {
      html = `<p>${tool.description}</p>`;
      container.dataset.descriptionSource = 'summary';
    } else {
      html = '<p>暂无详细介绍</p>';
      container.dataset.descriptionSource = 'fallback';
    }

    container.innerHTML = html;
  }

  async loadRelatedNavs() {
    const container = document.getElementById('related-nav-grid');
    if (!container) return;

    try {
      // 从数据管理器获取相关导航
      if (window.dataManager) {
        const { navigationData, categories } = window.dataManager.getCurrentData();
        const currentCategory = this.currentTool.category;
        
        // 获取同分类的其他工具（排除当前工具）
        const relatedTools = [];
        if (currentCategory && navigationData[currentCategory]) {
          relatedTools.push(
            ...navigationData[currentCategory]
              .filter(t => t.id !== this.currentTool.id && t.name !== this.currentTool.name)
              .slice(0, 6)
          );
        }

        // 如果同分类的工具不够，从其他分类补充
        if (relatedTools.length < 6) {
          for (const category in navigationData) {
            if (category === currentCategory) continue;
            const tools = navigationData[category]
              .filter(t => t.id !== this.currentTool.id && t.name !== this.currentTool.name)
              .slice(0, 6 - relatedTools.length);
            relatedTools.push(...tools);
            if (relatedTools.length >= 6) break;
          }
        }

        this.relatedTools = relatedTools.slice(0, 6);
      } else {
        // 如果没有数据管理器，使用mock数据
        this.relatedTools = this.getMockRelatedTools();
      }

      this.renderRelatedNavs();
    } catch (error) {
      console.error('加载相关导航失败:', error);
      // 使用mock数据作为后备
      this.relatedTools = this.getMockRelatedTools();
      this.renderRelatedNavs();
    }
  }

  getMockRelatedTools() {
    return [
      {
        id: 'mock_002',
        name: '相关网站一',
        url: 'https://www.example1.com',
        description: '相关网站的描述信息',
        category: '工具'
      },
      {
        id: 'mock_003',
        name: '相关网站二',
        url: 'https://www.example2.com',
        description: '另一个相关网站的描述',
        category: '工具'
      },
      {
        id: 'mock_004',
        name: '相关网站三',
        url: 'https://www.example3.com',
        description: '第三个相关网站的描述',
        category: '工具'
      }
    ];
  }

  renderRelatedNavs() {
    const container = document.getElementById('related-nav-grid');
    if (!container) return;

    if (this.relatedTools.length === 0) {
      container.innerHTML = '<p style="color: var(--text-mid);">暂无相关导航</p>';
      return;
    }

    container.innerHTML = '';
    this.relatedTools.forEach(tool => {
      const card = document.createElement('a');
      card.className = 'related-nav-card';
      const relatedTableId = tool.tableId || (this.currentTool ? this.currentTool.tableId : '');
      const tableQuery = relatedTableId ? `&table_id=${encodeURIComponent(relatedTableId)}` : '';
      card.href = `detail.html?id=${tool.id || ''}&name=${encodeURIComponent(tool.name || '')}&url=${encodeURIComponent(this.getToolUrl(tool))}${tableQuery}`;

      // 图标
      const icon = document.createElement('div');
      icon.className = 'nav-icon';
      icon.innerHTML = this.getRelatedIconTemplate(tool);

      // 信息
      const info = document.createElement('div');
      info.className = 'nav-info';
      info.innerHTML = `
        <div class="nav-name">${tool.name || '未知'}</div>
        <div class="nav-desc">${tool.description || '暂无描述'}</div>
      `;

      // 箭头
      const arrow = document.createElement('div');
      arrow.className = 'nav-arrow';
      arrow.innerHTML = '<i class="bi bi-chevron-right"></i>';

      card.appendChild(icon);
      card.appendChild(info);
      card.appendChild(arrow);
      container.appendChild(card);
    });
  }

  getRelatedIconTemplate(tool) {
    const nameInitial = (tool.name || '网').charAt(0).toUpperCase();
    const textIcon = (display = 'flex') => `<div class="text-icon" style="display:${display};">${nameInitial}</div>`;

    if (tool.icon && typeof tool.icon === 'string' && tool.icon.trim()) {
      if (tool.icon.startsWith('http')) {
        return `
          <img src="${tool.icon}" alt="${tool.name || ''}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          ${textIcon('none')}
        `;
      }
      return `<i class="bi ${tool.icon}"></i>`;
    }

    const faviconUrl = this.getFaviconUrl(tool.url);
    if (faviconUrl) {
      return `
        <img src="${faviconUrl}" alt="${tool.name || ''}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        ${textIcon('none')}
      `;
    }

    return textIcon();
  }

  renderAds() {
    // 侧边栏广告
    const sidebarAd = document.getElementById('sidebar-ad');
    if (sidebarAd) {
      sidebarAd.innerHTML = `
        <img src="https://via.placeholder.com/300x400?text=侧边栏广告" alt="广告" onerror="this.style.display='none'">
      `;
    }

    // 底部广告
    const bottomAd = document.getElementById('bottom-ad');
    if (bottomAd) {
      bottomAd.innerHTML = `
        <img src="https://via.placeholder.com/1200x200?text=底部广告" alt="广告" onerror="this.style.display='none'">
      `;
    }
  }

  loadComments() {
    // 从localStorage加载评论（实际应该从服务器加载）
    const toolId = this.currentTool?.id || 'default';
    let comments = JSON.parse(localStorage.getItem(`comments_${toolId}`) || '[]');
    
    // 如果没有评论，使用mock评论数据
    if (comments.length === 0) {
      comments = this.getMockComments();
      // 保存mock评论到localStorage
      localStorage.setItem(`comments_${toolId}`, JSON.stringify(comments));
    }
    
    this.renderComments(comments);
  }

  getMockComments() {
    return [
      {
        nickname: '游客001',
        email: 'visitor001@example.com',
        content: '这个网站很不错，功能很实用！',
        time: Date.now() - 3600000 * 2 // 2小时前
      },
      {
        nickname: '用户002',
        email: 'user002@example.com',
        content: '界面设计很美观，使用体验很好。',
        time: Date.now() - 86400000 // 1天前
      }
    ];
  }

  renderComments(comments) {
    const container = document.getElementById('comments-list');
    if (!container) return;

    if (comments.length === 0) {
      container.innerHTML = '<div class="no-comments"><p>暂无评论...</p></div>';
      return;
    }

    container.innerHTML = '';
    comments.forEach(comment => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-item-avatar">
          <i class="bi bi-person-circle"></i>
        </div>
        <div class="comment-item-content">
          <div class="comment-item-header">
            <span class="comment-item-name">${this.escapeHtml(comment.nickname || '匿名')}</span>
            <span class="comment-item-time">${this.formatTime(comment.time)}</span>
          </div>
          <div class="comment-item-text">${this.escapeHtml(comment.content)}</div>
        </div>
      `;
      container.appendChild(item);
    });
  }

  bindEvents() {
    // 返回按钮（移动端）
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if (hamburgerBtn) {
      hamburgerBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        if (sidebar) {
          sidebar.classList.toggle('active');
          if (overlay) {
            overlay.classList.toggle('active');
          }
        }
      });
    }

    // 移动端遮罩层点击关闭侧边栏
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          sidebar.classList.remove('active');
          overlay.classList.remove('active');
        }
      });
    }

    // 提交评论
    const submitBtn = document.getElementById('submit-comment-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.submitComment();
      });
    }

    // 评论输入框回车提交
    const commentContent = document.getElementById('comment-content');
    if (commentContent) {
      commentContent.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          this.submitComment();
        }
      });
    }

    // 手机查看按钮
    const mobileViewBtn = document.querySelector('.mobile-view-btn');
    if (mobileViewBtn) {
      mobileViewBtn.addEventListener('click', () => {
        const url = this.getToolUrl(this.currentTool);
        if (url) {
          window.open(url, '_blank');
        }
      });
    }
  }

  initSidebar() {
    // 初始化分类菜单
    if (window.uiRenderer && window.dataManager) {
      try {
        window.uiRenderer.generateCategoryMenu();
        
        // 绑定分类菜单点击事件
        const categoryMenu = document.getElementById('category-menu');
        if (categoryMenu) {
          categoryMenu.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-category]');
            if (li) {
              const category = li.getAttribute('data-category');
              if (category === 'all') {
                window.location.href = 'index.html';
              } else {
                window.location.href = `index.html?category=${encodeURIComponent(category)}`;
              }
            }
          });
        }
      } catch (error) {
        console.error('初始化侧边栏失败:', error);
      }
    }
  }

  bindFloatingActions() {
    // 返回顶部按钮
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    if (scrollTopBtn) {
      scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // 帮助按钮
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        alert('帮助功能开发中...');
      });
    }

    // 文档按钮
    const docsBtn = document.getElementById('docs-btn');
    if (docsBtn) {
      docsBtn.addEventListener('click', () => {
        alert('文档功能开发中...');
      });
    }

    // 首页按钮
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }

    // 浮动主题切换按钮
    const floatingThemeBtn = document.getElementById('floating-theme-btn');
    if (floatingThemeBtn && this.themeManager) {
      floatingThemeBtn.addEventListener('click', () => {
        if (this.themeManager) {
          this.themeManager.toggleMode();
        }
      });
    }

    // 微信二维码按钮
    const wechatBtn = document.getElementById('wechat-btn');
    const wechatPopup = document.getElementById('wechat-qr-popup');
    if (wechatBtn && wechatPopup) {
      wechatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        wechatPopup.classList.toggle('active');
      });
      document.addEventListener('click', () => {
        wechatPopup.classList.remove('active');
      });
      if (wechatPopup) {
        wechatPopup.addEventListener('click', (e) => e.stopPropagation());
      }
    }

    // 飞书二维码按钮
    const feishuBtn = document.getElementById('feishu-btn');
    const feishuPopup = document.getElementById('feishu-qr-popup');
    if (feishuBtn && feishuPopup) {
      feishuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        feishuPopup.classList.toggle('active');
      });
      document.addEventListener('click', () => {
        feishuPopup.classList.remove('active');
      });
      if (feishuPopup) {
        feishuPopup.addEventListener('click', (e) => e.stopPropagation());
      }
    }

    // 更多按钮
    const moreBtn = document.getElementById('more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        alert('更多功能开发中...');
      });
    }
  }

  submitComment() {
    const contentEl = document.getElementById('comment-content');
    const nicknameEl = document.getElementById('comment-nickname');
    const emailEl = document.getElementById('comment-email');
    const submitBtn = document.getElementById('submit-comment-btn');

    if (!contentEl || !nicknameEl || !submitBtn) return;

    const content = contentEl.value.trim();
    const nickname = nicknameEl.value.trim();
    const email = emailEl.value.trim();

    if (!content) {
      alert('请输入评论内容');
      return;
    }

    if (!nickname) {
      alert('请输入昵称');
      return;
    }

    // 禁用按钮
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    // 创建评论对象
    const comment = {
      content,
      nickname,
      email,
      time: Date.now()
    };

    // 保存到localStorage（实际应该保存到服务器）
    const toolId = this.currentTool?.id || 'default';
    const comments = JSON.parse(localStorage.getItem(`comments_${toolId}`) || '[]');
    comments.push(comment);
    localStorage.setItem(`comments_${toolId}`, JSON.stringify(comments));

    // 重新渲染评论
    this.renderComments(comments);

    // 清空表单
    contentEl.value = '';
    nicknameEl.value = '';
    if (emailEl) emailEl.value = '';

    // 恢复按钮
    submitBtn.disabled = false;
    submitBtn.textContent = '发表评论';

    // 显示成功提示
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #52c41a;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    successMsg.textContent = '评论提交成功！';
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
      successMsg.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(successMsg);
      }, 300);
    }, 2000);
  }

  getToolUrl(tool) {
    if (!tool || !tool.url) return '#';
    if (typeof tool.url === 'string') return tool.url;
    if (typeof tool.url === 'object') {
      return tool.url.link || tool.url.text || '#';
    }
    return '#';
  }

  getFaviconUrl(url) {
    try {
      if (typeof url === 'object') {
        url = url.link || url.text || '';
      }
      if (!url || typeof url !== 'string') return null;
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch (e) {
      return null;
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

    return date.toLocaleDateString('zh-CN');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showError(message) {
    const container = document.querySelector('.detail-main');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <i class="bi bi-exclamation-triangle" style="font-size: 48px; color: #ff4d4f; margin-bottom: 20px;"></i>
          <h3>${message}</h3>
          <p style="margin-top: 20px;">
            <a href="index.html" style="color: var(--menu-active-color);">返回首页</a>
          </p>
        </div>
      `;
    }
  }
}

// 初始化详情页
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.detailPageManager = new DetailPageManager();
  });
} else {
  window.detailPageManager = new DetailPageManager();
}

