/**
 * 主应用程序 - 重构后的模块化版本
 * 负责加载所有模块并初始化应用程序
 */

// 获取基础路径辅助函数
function getBasePath(path) {
  if( path === undefined ) {
    return window.BASE_PATH || '';
  }
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    return path;
  }
  const base = window.BASE_PATH || '';
  return base + path;
}

// 加载模块脚本
function loadModules() {
  const basePath = getBasePath();
  const modules = [
    // 核心模块
    `${basePath}/js/modules/core/pwa-manager.js`,
    `${basePath}/js/modules/core/theme-manager.js`, 
    `${basePath}/js/modules/core/auth-manager.js`,
    `${basePath}/js/modules/core/data-manager.js`,
    `${basePath}/js/modules/core/ui-renderer.js`,
    
    // 功能模块
    `${basePath}/js/modules/features/link-manager.js`,
    `${basePath}/js/modules/features/interaction-manager.js`,
    `${basePath}/js/modules/features/admin-review-manager.js`,
    `${basePath}/js/modules/features/bitable-manager.js`,
    `${basePath}/js/modules/features/nav-dropdown-manager.js`,
    
    // 工具模块
    `${basePath}/js/modules/utils/common-utils.js`
  ];

  return Promise.all(
    modules.map(src => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    })
  );
}

// 全局变量
let dataManager = null;
let uiRenderer = null;
let themeManager = null;
let pwaManager = null;
let authManager = null;
let linkManager = null;
let interactionManager = null;

// 初始化应用程序
async function initApp() {
  try {
    // 显示页面加载动画
    window.utils.showPageLoader();
    
    // 初始化粒子系统
    window.utils.initParticles();
    
    // 初始化核心模块
    await initCoreModules();
    
    // 初始化功能模块
    await initFeatureModules();
    
    // 初始化交互管理器
    interactionManager = new window.InteractionManager();
    
    // 获取并显示数据
    await loadAndDisplayData();
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 延迟隐藏页面加载动画，确保动画效果完整
    setTimeout(() => {
      window.utils.hidePageLoader();
      
      // 初始化皮肤选择器
      window.utils.initSkinSelector();
      
      // 确保图标背景色正确设置
      if (window.themeInitialized) {
        window.utils.refreshToolIcons();
      }
      
      // 验证用户偏好持久化功能
      setTimeout(() => {
        const isValid = window.utils.validatePersistence();
        if (isValid) {
          console.log('✅ 用户皮肤切换功能初始化成功');
        }
      }, 500);
    }, 800);
    
  } catch (error) {
    console.error('初始化失败:', error);
    handleInitError(error);
  }
}

// 初始化核心模块
async function initCoreModules() {
  // 初始化PWA管理器
  pwaManager = new window.PWAManager();
  
  // 初始化主题管理器
  themeManager = new window.ThemeManager();
  window.themeManager = themeManager; // 设置全局引用
  
  // 初始化验证管理器
  authManager = new window.AuthManager();
  window.authManager = authManager; // 设置全局引用
  // 显式调用init方法
  await authManager.init();
  
  // 初始化数据管理器
  dataManager = new window.DataManager();
  window.dataManager = dataManager; // 设置全局引用
  
  // 初始化UI渲染器
  uiRenderer = new window.UIRenderer(dataManager);
  window.uiRenderer = uiRenderer; // 设置全局引用
  
  // 初始化搜索功能
  initSearchFeature();
}

// 初始化功能模块
async function initFeatureModules() {
  // 初始化链接管理器
  linkManager = new window.LinkManager(dataManager);
  window.linkManager = linkManager; // 设置全局引用
  
  // 初始化多维表格管理器
  if (window.BitableManager) {
    const bitableManager = new window.BitableManager();
    window.bitableManager = bitableManager; // 设置全局引用
  }
  
  // 初始化导航下拉菜单管理器
  if (window.NavDropdownManager) {
    const navDropdownManager = new window.NavDropdownManager();
    window.navDropdownManager = navDropdownManager; // 设置全局引用
  }
}

// 加载并显示数据
async function loadAndDisplayData() {
  // 显示加载动画
  uiRenderer.showLoadingAnimation();
  
  try {
    const result = await dataManager.fetchNavigationData();
    
    if (result.success) {
      // 隐藏加载动画
      uiRenderer.hideLoadingAnimation();
      
      // 生成分类菜单
      uiRenderer.generateCategoryMenu();
      
      // 显示所有工具
      uiRenderer.showTools('all');
    } else {
      uiRenderer.hideLoadingAnimation();
      uiRenderer.showError('加载数据失败，请稍后重试');
    }
  } catch (error) {
    console.error('加载数据异常:', error);
    uiRenderer.hideLoadingAnimation();
    uiRenderer.showError('网络错误，请检查网络连接');
  }
}

// 初始化搜索功能
function initSearchFeature() {
  const searchInput = document.getElementById('main-search-input');
  const searchButton = document.getElementById('main-search-button');
  const searchEngines = document.getElementById('search-engines');
  
  if (!searchInput || !searchButton || !searchEngines) return;
  
  // 当前选中的搜索引擎
  let currentEngine = 'baidu';
  
  // 搜索引擎配置
  const engines = {
    baidu: {
      name: '百度',
      url: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
      placeholder: '百度一下'
    },
    bing: {
      name: 'Bing',
      url: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      placeholder: 'Bing搜索'
    },
    google: {
      name: 'Google',
      url: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      placeholder: 'Google搜索'
    },
    perplexity: {
      name: 'Perplexity',
      url: (query) => `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`,
      placeholder: 'Perplexity搜索'
    },
    you: {
      name: 'YOU',
      url: (query) => `https://you.com/search?q=${encodeURIComponent(query)}`,
      placeholder: 'YOU搜索'
    },
    '360': {
      name: '360',
      url: (query) => `https://www.so.com/s?q=${encodeURIComponent(query)}`,
      placeholder: '360搜索'
    },
    sougou: {
      name: '搜狗',
      url: (query) => `https://www.sogou.com/web?query=${encodeURIComponent(query)}`,
      placeholder: '搜狗搜索'
    },
    shenma: {
      name: '神马',
      url: (query) => `https://m.sm.cn/s?q=${encodeURIComponent(query)}`,
      placeholder: '神马搜索'
    }
  };
  
  // 更新占位符
  function updatePlaceholder() {
    if (engines[currentEngine]) {
      searchInput.placeholder = engines[currentEngine].placeholder;
    }
  }
  
  // 切换搜索引擎
  function switchEngine(engineId) {
    currentEngine = engineId;
    
    // 更新活动状态
    searchEngines.querySelectorAll('.search-engine-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.engine === engineId) {
        item.classList.add('active');
      }
    });
    
    // 更新占位符
    updatePlaceholder();
  }
  
  // 绑定搜索引擎点击事件
  searchEngines.querySelectorAll('.search-engine-item').forEach(item => {
    item.addEventListener('click', () => {
      switchEngine(item.dataset.engine);
    });
  });
  
  // 搜索按钮点击事件
  searchButton.addEventListener('click', () => {
    performSearch();
  });
  
  // 回车键搜索
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  
  // 搜索功能
  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    
    const engine = engines[currentEngine];
    if (engine) {
      window.open(engine.url(query), '_blank');
    }
  }
  
  // 初始化
  updatePlaceholder();
}

// 绑定事件监听器
function bindEventListeners() {
  // 主页菜单项点击事件
  const homeMenuItem = document.querySelector('[data-category="all"]');
  if (homeMenuItem) {
    homeMenuItem.addEventListener('click', () => {
      // 如果当前显示详情视图，先返回到列表视图
      if (uiRenderer && uiRenderer.isDetailViewVisible && uiRenderer.isDetailViewVisible()) {
        uiRenderer.hideDetailView();
        // 延迟一下再显示全部工具，确保视图切换动画完成
        setTimeout(() => {
          uiRenderer.showTools('all');
        }, 100);
      } else {
        // 直接显示全部工具
        uiRenderer.showTools('all');
      }
    });
  }

  // 数据变更事件监听器
  window.addEventListener('dataChanged', async () => {
    console.log('数据发生变更，重新加载...');
    await loadAndDisplayData();
  });

  // 认证状态变更事件监听器（用于更新编辑按钮的显示）
  window.addEventListener('authStatusChanged', () => {
    console.log('认证状态发生变更，重新渲染工具项...');
    // 重新渲染当前分类的工具项，以便显示或隐藏编辑按钮
    if (uiRenderer) {
      const currentCategory = uiRenderer.getCurrentCategory();
      uiRenderer.showTools(currentCategory);
    }
  });

  // 绑定浮动按钮事件
  bindFloatingActions();
}

// 绑定浮动操作按钮
function bindFloatingActions() {
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
      if (uiRenderer) {
        uiRenderer.showTools('all');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // 浮动主题切换按钮 - 使用延迟绑定，确保自定义元素已渲染
  function bindFloatingThemeButton() {
    const floatingThemeBtn = document.getElementById('floating-theme-btn');
    if (floatingThemeBtn && window.themeManager) {
      // 移除可能存在的旧事件监听器
      const newBtn = floatingThemeBtn.cloneNode(true);
      floatingThemeBtn.parentNode.replaceChild(newBtn, floatingThemeBtn);
      
      // 绑定新的点击事件
      newBtn.addEventListener('click', () => {
        if (window.themeManager) {
          window.themeManager.toggleMode();
        }
      });
      
      // 初始化时更新图标
      setTimeout(() => updateFloatingThemeIcon(), 100);
      
      // 监听主题变化，更新图标（通过MutationObserver监听data-theme属性变化）
      const observer = new MutationObserver(() => {
        updateFloatingThemeIcon();
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    } else if (!floatingThemeBtn) {
      // 如果按钮还不存在，延迟重试
      setTimeout(bindFloatingThemeButton, 100);
    }
  }

  // 更新浮动主题按钮图标
  function updateFloatingThemeIcon() {
    const floatingThemeBtn = document.getElementById('floating-theme-btn');
    if (!floatingThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = floatingThemeBtn.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'bi bi-sun' : 'bi bi-moon';
      floatingThemeBtn.title = isDark ? '切换亮色模式' : '切换暗黑模式';
    }
  }

  // 尝试绑定浮动主题按钮（延迟执行，确保自定义元素已渲染）
  setTimeout(bindFloatingThemeButton, 200);

  // 更多按钮
  const moreBtn = document.getElementById('more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      alert('更多功能开发中...');
    });
  }
}

// 处理初始化错误
function handleInitError(error) {
  const toolsGrid = document.getElementById('tools-grid');
  if (toolsGrid) {
    toolsGrid.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #666;">
        <i class="bi bi-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px; color: #ff4d4f;"></i>
        <h3>页面加载失败</h3>
        <p>请刷新页面重试</p>
        <button onclick="location.reload()" style="
          margin-top: 20px;
          padding: 10px 20px;
          background: #1677ff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        ">刷新页面</button>
      </div>
    `;
  }
}

// 初始化性能监控和错误处理
function initGlobalFeatures() {
  window.utils.initPerformanceMonitoring();
  window.utils.initErrorHandling();
}

// 兼容性函数 - 保持向后兼容
window.refreshToolIcons = function() {
  if (window.uiRenderer) {
    window.uiRenderer.refreshToolIcons();
  }
};

window.toggleTheme = function() {
  if (window.themeManager) {
    window.themeManager.toggleMode();
  }
};

// 在DOM加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await loadModules();
    initGlobalFeatures();
    await initApp();
  });
} else {
  // DOM已经加载完成
  loadModules().then(() => {
    initGlobalFeatures();
    initApp();
  });
}