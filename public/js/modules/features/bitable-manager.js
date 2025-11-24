/**
 * 多维表格管理器 - 处理多维表格的创建、列表和分页查询
 */
class BitableManager {
  constructor() {
    this.currentPageToken = null;
    this.hasMore = false;
    this.isLoading = false;
    this.init();
  }

  init() {
    this.bindEvents();
    this.updateButtonVisibility();
  }

  // 绑定事件
  bindEvents() {
    // 桌面端和移动端的打开按钮
    const desktopBtn = document.getElementById('bitable-manage-btn-desktop');
    const mobileBtn = document.getElementById('bitable-manage-btn-mobile');
    
    if (desktopBtn) {
      desktopBtn.addEventListener('click', () => this.showManageModal());
    }
    
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => this.showManageModal());
    }

    // 关闭管理弹窗
    const closeBtn = document.getElementById('close-bitable-manage-modal-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideManageModal());
    }

    const manageModal = document.getElementById('bitable-manage-modal');
    if (manageModal) {
      const overlay = manageModal.querySelector('.modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => this.hideManageModal());
      }
    }

    // 新建表格按钮
    const createBtn = document.getElementById('create-bitable-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateModal());
    }

    // 创建表格弹窗
    const closeCreateBtn = document.getElementById('close-create-bitable-modal-btn');
    if (closeCreateBtn) {
      closeCreateBtn.addEventListener('click', () => this.hideCreateModal());
    }

    const cancelCreateBtn = document.getElementById('cancel-create-bitable-btn');
    if (cancelCreateBtn) {
      cancelCreateBtn.addEventListener('click', () => this.hideCreateModal());
    }

    const createModal = document.getElementById('create-bitable-modal');
    if (createModal) {
      const overlay = createModal.querySelector('.modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => this.hideCreateModal());
      }
    }

    // 提交创建表单
    const submitBtn = document.getElementById('submit-create-bitable-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitCreateForm());
    }

    // 分页按钮
    const prevBtn = document.getElementById('bitable-prev-btn');
    const nextBtn = document.getElementById('bitable-next-btn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.loadPreviousPage());
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.loadNextPage());
    }

    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const manageModal = document.getElementById('bitable-manage-modal');
        const createModal = document.getElementById('create-bitable-modal');
        if (manageModal && manageModal.classList.contains('active')) {
          this.hideManageModal();
        }
        if (createModal && createModal.classList.contains('active')) {
          this.hideCreateModal();
        }
      }
    });
  }

  // 更新按钮可见性
  async updateButtonVisibility() {
    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/auth/status`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        const isAuthenticated = result.authenticated || false;
        
        const desktopBtn = document.getElementById('bitable-manage-btn-desktop');
        const mobileBtn = document.getElementById('bitable-manage-btn-mobile');
        
        if (desktopBtn) {
          desktopBtn.style.display = isAuthenticated ? 'flex' : 'none';
        }
        if (mobileBtn) {
          mobileBtn.style.display = isAuthenticated ? 'flex' : 'none';
        }
      }
    } catch (error) {
      console.error('检查认证状态失败:', error);
    }
  }

  // 显示管理弹窗
  showManageModal() {
    const modal = document.getElementById('bitable-manage-modal');
    if (modal) {
      modal.classList.add('active');
      this.loadBitableList();
    }
  }

  // 隐藏管理弹窗
  hideManageModal() {
    const modal = document.getElementById('bitable-manage-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // 显示创建弹窗
  showCreateModal() {
    const modal = document.getElementById('create-bitable-modal');
    if (modal) {
      modal.classList.add('active');
      // 重置表单
      const form = document.getElementById('create-bitable-form');
      if (form) {
        form.reset();
      }
      // 清除错误信息
      this.clearErrors();
    }
  }

  // 隐藏创建弹窗
  hideCreateModal() {
    const modal = document.getElementById('create-bitable-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // 清除错误信息
  clearErrors() {
    const errorElements = document.querySelectorAll('#create-bitable-modal .error-message');
    errorElements.forEach(el => {
      el.textContent = '';
    });
  }

  // 加载多维表格列表
  async loadBitableList(pageToken = null, direction = 'next') {
    if (this.isLoading) return;

    const container = document.getElementById('bitable-list-container');
    if (!container) return;

    this.isLoading = true;
    container.innerHTML = `
      <div class="loading-state">
        <i class="bi bi-hourglass-split"></i>
        <p>加载中...</p>
      </div>
    `;

    try {
      const basePath = window.BASE_PATH || '';
      const params = new URLSearchParams({ page_size: '20' });
      if (pageToken) {
        params.append('page_token', pageToken);
      }

      const response = await fetch(`${basePath}/api/bitables?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          container.innerHTML = `
            <div class="empty-state">
              <i class="bi bi-shield-exclamation"></i>
              <p>需要登录才能查看多维表格</p>
            </div>
          `;
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        this.currentPageToken = result.data.page_token;
        this.hasMore = result.data.has_more || false;
        this.renderBitableList(result.data.items || []);
        this.updatePagination();
      } else {
        container.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-exclamation-triangle"></i>
            <p>${result.message || '加载失败'}</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('加载多维表格列表失败:', error);
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-exclamation-triangle"></i>
          <p>加载失败: ${error.message}</p>
        </div>
      `;
    } finally {
      this.isLoading = false;
    }
  }

  // 渲染多维表格列表
  renderBitableList(items) {
    const container = document.getElementById('bitable-list-container');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-table"></i>
          <p>暂无多维表格，点击"新建表格"创建</p>
        </div>
      `;
      return;
    }

    const listHTML = `
      <div class="pending-links-list">
        ${items.map(item => {
          const feishuUrl = this.buildFeishuUrl(item.app_token, item.table_id);
          return `
          <div class="pending-link-item bitable-item" data-app-token="${this.escapeHtml(item.app_token || '')}" data-table-id="${this.escapeHtml(item.table_id || '')}">
            <div class="link-info">
              <div class="link-name">
                <i class="bi bi-table"></i>
                ${this.escapeHtml(item.table_name || '未命名表格')}
              </div>
              <div class="link-url">
                <span>表格ID: </span>
                <code>${this.escapeHtml(item.table_id || '')}</code>
              </div>
              ${item.description ? `
                <div class="link-meta">
                  <i class="bi bi-info-circle"></i>
                  <span>${this.escapeHtml(item.description)}</span>
                </div>
              ` : ''}
              <div class="link-meta">
                <i class="bi bi-calendar"></i>
                <span>创建时间: ${this.formatDate(item.created_time)}</span>
              </div>
            </div>
            <div class="link-actions">
              <button class="action-btn open-bitable-btn" title="打开多维表格" data-url="${this.escapeHtml(feishuUrl)}">
                <i class="bi bi-box-arrow-up-right"></i>
                <span>打开</span>
              </button>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `;

    container.innerHTML = listHTML;
    
    // 绑定打开链接事件
    this.bindOpenBitableEvents();
  }

  // 更新分页控件
  updatePagination() {
    const pagination = document.getElementById('bitable-pagination');
    const prevBtn = document.getElementById('bitable-prev-btn');
    const nextBtn = document.getElementById('bitable-next-btn');
    const info = document.getElementById('bitable-pagination-info');

    if (!pagination) return;

    // 暂时隐藏分页，因为需要维护历史记录才能实现上一页
    // 这里简化处理，只显示下一页
    if (this.hasMore) {
      pagination.style.display = 'flex';
      if (prevBtn) prevBtn.disabled = true; // 简化处理，不支持上一页
      if (nextBtn) nextBtn.disabled = false;
      if (info) info.textContent = this.hasMore ? '还有更多数据' : '';
    } else {
      pagination.style.display = 'flex';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = false;
      if (info) info.textContent = '已显示全部';
    }
  }

  // 加载下一页
  loadNextPage() {
    if (this.hasMore && this.currentPageToken && !this.isLoading) {
      this.loadBitableList(this.currentPageToken, 'next');
    }
  }

  // 加载上一页（简化处理，重新加载第一页）
  loadPreviousPage() {
    if (!this.isLoading) {
      this.loadBitableList(null, 'prev');
    }
  }

  // 提交创建表单
  async submitCreateForm() {
    const nameInput = document.getElementById('bitable-name');
    const descriptionInput = document.getElementById('bitable-description');
    const submitBtn = document.getElementById('submit-create-bitable-btn');

    if (!nameInput || !descriptionInput || !submitBtn) return;

    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();

    // 验证
    this.clearErrors();
    let hasError = false;

    if (!name) {
      const errorEl = document.getElementById('bitable-name-error');
      if (errorEl) {
        errorEl.textContent = '表格名称不能为空';
      }
      hasError = true;
    }

    if (name.length > 100) {
      const errorEl = document.getElementById('bitable-name-error');
      if (errorEl) {
        errorEl.textContent = '表格名称长度不能超过100个字符';
      }
      hasError = true;
    }

    if (description.length > 500) {
      const errorEl = document.getElementById('bitable-description-error');
      if (errorEl) {
        errorEl.textContent = '描述长度不能超过500个字符';
      }
      hasError = true;
    }

    if (hasError) return;

    // 禁用提交按钮
    submitBtn.disabled = true;
    submitBtn.textContent = '创建中...';

    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/bitables`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          table_name: name,
          description: description
        })
      });

      const result = await response.json();

      if (result.success) {
        // 显示成功消息
        this.showMessage('多维表格创建成功', 'success');
        // 关闭创建弹窗
        this.hideCreateModal();
        // 刷新列表
        this.loadBitableList();
      } else {
        // 显示错误消息
        this.showMessage(result.message || '创建失败', 'error');
      }
    } catch (error) {
      console.error('创建多维表格失败:', error);
      this.showMessage(`创建失败: ${error.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '创建';
    }
  }

  // 显示消息
  showMessage(message, type = 'success') {
    // 创建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = `admin-review-message ${type}`;
    messageEl.textContent = message;
    document.body.appendChild(messageEl);

    // 3秒后移除
    setTimeout(() => {
      messageEl.style.animation = 'fadeOutSlideOut 0.3s ease';
      setTimeout(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      }, 300);
    }, 3000);
  }

  // 转义HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 格式化日期
  formatDate(timestamp) {
    if (!timestamp) return '未知';
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 构建飞书多维表格URL
  buildFeishuUrl(appToken, tableId) {
    if (!appToken || !tableId) {
      return '';
    }
    // 使用用户提供的域名格式
    return `https://bcnlear85cwz.feishu.cn/base/${appToken}?table=${tableId}&view=vewDF98x3k`;
  }

  // 绑定打开表格事件
  bindOpenBitableEvents() {
    const openButtons = document.querySelectorAll('.open-bitable-btn');
    openButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url) {
          window.open(url, '_blank');
        }
      });
    });

    // 也可以点击整个表格项来打开
    const bitableItems = document.querySelectorAll('.bitable-item');
    bitableItems.forEach(item => {
      item.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发
        if (e.target.closest('.open-bitable-btn') || e.target.closest('.link-actions')) {
          return;
        }
        const btn = item.querySelector('.open-bitable-btn');
        if (btn) {
          const url = btn.getAttribute('data-url');
          if (url) {
            window.open(url, '_blank');
          }
        }
      });
      // 添加鼠标悬停效果
      item.style.cursor = 'pointer';
    });
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BitableManager;
} else {
  window.BitableManager = BitableManager;
}

