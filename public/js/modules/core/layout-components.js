/**
 * 布局组件 - 提供顶部导航、侧边栏、详情主体和浮动操作按钮
 * 通过自定义元素的方式在各页面间复用
 */
(function() {
  const getBase = (path = '') => {
    if (typeof window !== 'undefined' && typeof window.getBasePath === 'function') {
      return window.getBasePath(path);
    }
    return path || '';
  };

  const ensureRendered = (instance, template) => {
    if (instance._rendered) return;
    instance.innerHTML = template;
    instance._rendered = true;
  };

  class AppTopNav extends HTMLElement {
    connectedCallback() {
      const homeHref = getBase('index.html') || 'index.html';
      ensureRendered(this, `
        <!-- 移动端顶部导航栏 -->
        <header class="mobile-header">
          <div class="mobile-nav">
            <button class="hamburger-btn" id="hamburger-btn" aria-label="打开菜单">
              <span></span>
              <span></span>
              <span></span>
            </button>
            <div class="mobile-logo">
              <img src="${getBase('img/avatar.jpeg')}" alt="logo">
              <span>曹操直达</span>
            </div>
            <div class="mobile-actions">
              <button id="review-btn-mobile" class="review-button mobile-action-btn" title="游客申请" style="display: none;">
                <i class="bi bi-clock-history"></i>
              </button>
              <button id="bitable-manage-btn-mobile" class="mobile-action-btn" title="多维表格管理" style="display: none;">
                <i class="bi bi-table"></i>
              </button>
              <button id="login-btn-mobile" class="mobile-action-btn login-button" title="登录">
                <i class="bi bi-lock"></i>
              </button>
              <button id="theme-toggle-btn" class="mobile-action-btn theme-toggle-button" title="切换暗黑模式">
                <i class="bi bi-moon"></i>
              </button>
            </div>
          </div>
        </header>

        <!-- 顶部导航栏（桌面端） -->
        <header class="top-header desktop-only">
          <div class="header-content">
            <div class="header-left">
              <div class="header-logo">
                <a href="${homeHref}" style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit;">
                  <img src="${getBase('img/avatar.jpeg')}" alt="logo">
                  <span>曹操直达</span>
                </a>
              </div>
              <nav class="header-nav">
                <div class="nav-dropdown">
                  <a href="#" class="nav-link dropdown-trigger">
                    <span>专业导航</span>
                    <i class="bi bi-chevron-down"></i>
                  </a>
                  <div class="dropdown-menu" id="bitable-dropdown-menu">
                    <div class="dropdown-loading">
                      <i class="bi bi-hourglass-split"></i>
                      <span>加载中...</span>
                    </div>
                  </div>
                </div>
                <a href="${homeHref}" class="nav-link">首页</a>
                <a href="#" class="nav-link">在线工具</a>
                <a href="#" class="nav-link">AI资源集</a>
                <a href="#" class="nav-link">关于我们</a>
              </nav>
            </div>
            <div class="header-right">
              <button id="review-btn-desktop" class="review-button header-action-btn" title="游客申请" style="display: none;">
                <i class="bi bi-clock-history"></i>
                <span id="review-status-text">游客申请</span>
              </button>
              <button id="bitable-manage-btn-desktop" class="header-action-btn" title="多维表格管理" style="display: none;">
                <i class="bi bi-table"></i>
                <span>表格管理</span>
              </button>
              <button id="login-btn-desktop" class="header-action-btn login-button" title="登录">
                <i class="bi bi-lock"></i>
                <span id="login-status-text">登录</span>
              </button>
              <button id="desktop-theme-toggle-btn" class="header-action-btn theme-toggle-button" title="切换暗黑模式">
                <i class="bi bi-moon"></i>
              </button>
            </div>
          </div>
        </header>

        <div class="desktop-actions desktop-only" style="display: none;"></div>
        <div class="mobile-overlay" id="mobile-overlay"></div>
      `);
    }
  }

  class AppSidebar extends HTMLElement {
    connectedCallback() {
      ensureRendered(this, `
        <aside class="sidebar" id="sidebar">
          <nav class="nav-menu">
            <ul id="category-menu">
              <li class="active" data-category="all"><i class="bi bi-house-door"></i> 全部</li>
            </ul>

            <div class="skin-selector" id="skin-selector">
              <div class="current-skin">
                <div class="current-skin-preview">
                  <i class="bi bi-stars current-skin-icon"></i>
                </div>
                <span class="current-skin-name">霓虹风格</span>
                <button class="skin-expand-btn">
                  <i class="bi bi-chevron-down"></i>
                </button>
              </div>

              <div class="skin-options">
                <div class="skin-grid">
                  <div class="skin-option active" data-skin="neon">
                    <div class="skin-colors">
                      <div class="color-dot primary"></div>
                      <div class="color-dot secondary"></div>
                      <div class="color-dot accent"></div>
                    </div>
                    <span class="skin-label">霓虹风格</span>
                  </div>
                  
                  <div class="skin-option" data-skin="ocean">
                    <div class="skin-colors">
                      <div class="color-dot primary"></div>
                      <div class="color-dot secondary"></div>
                      <div class="color-dot accent"></div>
                    </div>
                    <span class="skin-label">海洋蓝调</span>
                  </div>
                  
                  <div class="skin-option" data-skin="forest">
                    <div class="skin-colors">
                      <div class="color-dot primary"></div>
                      <div class="color-dot secondary"></div>
                      <div class="color-dot accent"></div>
                    </div>
                    <span class="skin-label">森林绿意</span>
                  </div>
                  
                  <div class="skin-option" data-skin="sunset">
                    <div class="skin-colors">
                      <div class="color-dot primary"></div>
                      <div class="color-dot secondary"></div>
                      <div class="color-dot accent"></div>
                    </div>
                    <span class="skin-label">日落橙黄</span>
                  </div>
                  
                  <div class="skin-option" data-skin="purple">
                    <div class="skin-colors">
                      <div class="color-dot primary"></div>
                      <div class="color-dot secondary"></div>
                      <div class="color-dot accent"></div>
                    </div>
                    <span class="skin-label">优雅紫色</span>
                  </div>
                  
                  <div class="skin-option" data-skin="classic">
                    <div class="skin-colors">
                      <div class="color-dot primary"></div>
                      <div class="color-dot secondary"></div>
                      <div class="color-dot accent"></div>
                    </div>
                    <span class="skin-label">经典灰调</span>
                  </div>
                </div>
                
                <div class="skin-mode-toggle">
                  <i class="bi bi-moon"></i>
                  <span>暗黑模式</span>
                </div>
              </div>
            </div>
          </nav>
        </aside>
      `);
    }
  }

  class DetailMain extends HTMLElement {
    connectedCallback() {
      ensureRendered(this, `
        <div class="detail-container">
          <div class="detail-main">
            <section class="detail-intro-card">
              <div class="intro-card-content">
                <div class="intro-left">
                  <div class="intro-icon">
                    <img id="detail-icon" src="" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                  </div>
                  <div class="intro-info">
                    <h1 id="detail-title" class="intro-title">网站名称</h1>
                    <p id="detail-description" class="intro-description">网站描述信息</p>
                    <div class="intro-tags" id="detail-tags"></div>
                  </div>
                </div>
                <div class="intro-right">
                  <a id="detail-direct-link" href="#" target="_blank" class="direct-link-btn">
                    <span>链接直达</span>
                    <i class="bi bi-arrow-right"></i>
                  </a>
                  <button class="mobile-view-btn" title="手机查看">
                    <i class="bi bi-phone"></i>
                    <span>手机查看</span>
                  </button>
                  <button class="info-btn" title="详细信息">
                    <i class="bi bi-info-circle"></i>
                  </button>
                </div>
              </div>
            </section>

            <section class="carousel-ads-section">
              <div class="carousel-ads-container" id="carousel-ads"></div>
            </section>

            <section class="detail-description-section">
              <div class="description-content">
                <h2 class="section-title">网站详细介绍</h2>
                <div id="detail-full-description" class="full-description" data-description-source=""></div>
              </div>
            </section>

            <section class="related-nav-section">
              <h2 class="section-title">相关导航</h2>
              <div class="related-nav-grid" id="related-nav-grid"></div>
            </section>

            <section class="bottom-ad-section">
              <div class="ad-banner" id="bottom-ad"></div>
            </section>

            <section class="comment-section">
              <h2 class="section-title">游客反馈</h2>
              <div class="comment-form">
                <div class="comment-avatar">
                  <i class="bi bi-person-circle"></i>
                </div>
                <div class="comment-input-wrapper">
                  <textarea id="comment-content" class="comment-textarea" placeholder="输入评论内容..."></textarea>
                  <div class="comment-meta">
                    <input type="text" id="comment-nickname" class="comment-input" placeholder="昵称">
                    <input type="email" id="comment-email" class="comment-input" placeholder="邮箱">
                    <button id="submit-comment-btn" class="comment-submit-btn">发表评论</button>
                  </div>
                </div>
              </div>
              <div class="comments-list" id="comments-list">
                <div class="no-comments">
                  <p>暂无评论...</p>
                </div>
              </div>
            </section>
          </div>

          <aside class="detail-sidebar">
            <div class="sidebar-ad" id="sidebar-ad"></div>
          </aside>
        </div>
      `);
    }
  }

  class AppFloatingActions extends HTMLElement {
    connectedCallback() {
      ensureRendered(this, `
        <div class="floating-actions desktop-only">
          <button class="floating-btn" id="scroll-top-btn" title="返回顶部">
            <i class="bi bi-arrow-up"></i>
          </button>
          <button class="floating-btn" id="help-btn" title="帮助">
            <i class="bi bi-question-circle"></i>
          </button>
          <button class="floating-btn" id="docs-btn" title="文档">
            <i class="bi bi-file-text"></i>
          </button>
          <button class="floating-btn" id="home-btn" title="首页">
            <i class="bi bi-house"></i>
          </button>
          <button class="floating-btn" id="floating-theme-btn" title="切换暗黑模式">
            <i class="bi bi-moon"></i>
          </button>
          <div class="wechat-qr-container">
            <button class="floating-btn" id="wechat-btn" title="微信二维码">
              <i class="bi bi-wechat"></i>
            </button>
            <div class="wechat-qr-popup" id="wechat-qr-popup">
              <div class="qr-code-wrapper">
                <img src="${getBase('img/wechat-qr.png')}" alt="微信二维码" class="qr-code-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div class="qr-code-placeholder" style="display: none;">
                  <i class="bi bi-qr-code-scan" style="font-size: 80px; color: #999;"></i>
                  <p style="margin-top: 10px; color: #999; font-size: 14px;">请添加微信二维码图片<br>路径: ./img/wechat-qr.png</p>
                </div>
              </div>
              <div class="qr-arrow"></div>
            </div>
          </div>
          <div class="feishu-qr-container">
            <button class="floating-btn" id="feishu-btn" title="飞书二维码">
              <i class="bi bi-chat-dots"></i>
            </button>
            <div class="feishu-qr-popup" id="feishu-qr-popup">
              <div class="qr-code-wrapper">
                <img src="${getBase('img/feishu-qr.png')}" alt="飞书二维码" class="qr-code-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div class="qr-code-placeholder" style="display: none;">
                  <i class="bi bi-qr-code-scan" style="font-size: 80px; color: #999;"></i>
                  <p style="margin-top: 10px; color: #999; font-size: 14px;">请添加飞书二维码图片<br>路径: ./img/feishu-qr.png</p>
                </div>
              </div>
              <div class="qr-arrow"></div>
            </div>
          </div>
          <button class="floating-btn" id="more-btn" title="更多">
            <i class="bi bi-three-dots"></i>
          </button>
        </div>
      `);
    }
  }

  if (!customElements.get('app-top-nav')) {
    customElements.define('app-top-nav', AppTopNav);
  }
  if (!customElements.get('app-sidebar')) {
    customElements.define('app-sidebar', AppSidebar);
  }
  if (!customElements.get('detail-main')) {
    customElements.define('detail-main', DetailMain);
  }
  if (!customElements.get('app-floating-actions')) {
    customElements.define('app-floating-actions', AppFloatingActions);
  }
})();

