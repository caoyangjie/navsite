/**
 * 管理员审核管理器 - 处理待审核链接的管理功能
 * 支持管理员模式和游客模式
 */
class AdminReviewManager {
  constructor(containerId = 'admin-pending-links-container', isAdmin = false) {
    this.containerId = containerId;
    this.isAdmin = isAdmin; // 是否为管理员模式
    this.currentPageToken = null;
    this.hasMore = false;
    this.pageHistory = [null]; // 页面历史栈，用于返回上一页
    this.currentPageIndex = 0;
  }

  // 设置管理员模式
  setAdminMode(isAdmin) {
    this.isAdmin = isAdmin;
    // 更新弹窗标题
    this.updateModalTitle();
  }

  // 更新弹窗标题
  updateModalTitle() {
    const modalHeader = document.querySelector('#admin-review-modal .modal-header h2');
    if (modalHeader) {
      modalHeader.textContent = this.isAdmin ? '待审核链接管理' : '我的申请';
    }
  }

  async loadPendingLinks(pageToken = null, addToHistory = true) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('容器元素未找到:', this.containerId);
      return;
    }

    container.innerHTML = '<div class="loading-state"><i class="bi bi-hourglass-split"></i><p>加载中...</p></div>';

    try {
      const basePath = window.BASE_PATH || '';
      // 根据用户身份选择不同的API
      const apiEndpoint = this.isAdmin ? 'pending-links' : 'pending-links-public';
      const url = `${basePath}/api/${apiEndpoint}${pageToken ? `?page_token=${pageToken}` : ''}`;
      
      const response = await fetch(url, {
        credentials: 'include'
      });

      if (response.status === 401) {
        // 需要登录（仅管理员模式）
        if (this.isAdmin) {
          container.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>需要登录</p></div>';
          if (window.authManager) {
            window.authManager.showLoginModal();
          }
        } else {
          container.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>加载失败</p></div>';
        }
        return;
      }

      const result = await response.json();

      if (result.success) {
        // 游客模式使用公开API，没有分页信息
        if (this.isAdmin) {
          const newPageToken = result.pagination?.pageToken || null;
          this.hasMore = result.pagination?.hasMore || false;
          
          // 更新页面历史
          if (addToHistory) {
            // 如果是在历史栈中前进，需要截断后面的历史
            if (this.currentPageIndex < this.pageHistory.length - 1) {
              this.pageHistory = this.pageHistory.slice(0, this.currentPageIndex + 1);
            }
            this.pageHistory.push(newPageToken);
            this.currentPageIndex = this.pageHistory.length - 1;
          }
          
          this.currentPageToken = newPageToken;
        } else {
          // 游客模式不支持分页
          this.currentPageToken = null;
          this.hasMore = false;
        }
        
        this.renderPendingLinks(result.data);
      } else {
        this.showError(result.message || '加载失败');
        container.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>加载失败</p></div>';
      }
    } catch (error) {
      console.error('加载待审核链接异常:', error);
      this.showError('网络错误，请检查网络连接后重试');
      container.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>加载失败</p></div>';
    }
  }

  renderPendingLinks(links) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (!links || links.length === 0) {
      const emptyText = this.isAdmin ? '暂无待审核的链接' : '暂无待审核的申请';
      container.innerHTML = `<div class="empty-state"><i class="bi bi-inbox"></i><p>${emptyText}</p></div>`;
      return;
    }

    const listHtml = `
      <div class="pending-links-list">
        ${links.map(link => `
          <div class="pending-link-item" data-id="${link.id}">
            <div class="link-info">
              <div class="link-name">${this.escapeHtml(link.name)}</div>
              <div class="link-url">
                <a href="${this.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
                  ${this.escapeHtml(link.url)}
                </a>
              </div>
              <div class="link-meta">
                <span><i class="bi bi-tag"></i> ${this.escapeHtml(link.category)}</span>
                <span><i class="bi bi-sort-numeric-down"></i> 排序: ${link.sort}</span>
              </div>
              ${!this.isAdmin ? '<div class="status-badge status-pending"><i class="bi bi-clock"></i> 等待审核</div>' : ''}
            </div>
            ${this.isAdmin ? `
            <div class="link-actions">
              <button class="action-btn approve-btn" onclick="window.adminReviewManagerInstance.approveLink('${link.id}')">
                <i class="bi bi-check-circle"></i>
                同意
              </button>
              <button class="action-btn reject-btn" onclick="window.adminReviewManagerInstance.rejectLink('${link.id}')">
                <i class="bi bi-x-circle"></i>
                拒绝
              </button>
            </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      ${this.isAdmin ? this.renderPagination() : ''}
    `;

    container.innerHTML = listHtml;
  }

  renderPagination() {
    const canGoPrevious = this.currentPageIndex > 0;
    const canGoNext = this.hasMore;

    if (!canGoPrevious && !canGoNext) {
      return '';
    }

    return `
      <div class="pagination">
        <button class="pagination-btn" onclick="window.adminReviewManagerInstance.loadPreviousPage()" ${!canGoPrevious ? 'disabled' : ''}>
          <i class="bi bi-chevron-left"></i>
          上一页
        </button>
        <button class="pagination-btn" onclick="window.adminReviewManagerInstance.loadNextPage()" ${!canGoNext ? 'disabled' : ''}>
          下一页
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  async approveLink(linkId) {
    if (!confirm('确定要同意这个申请吗？链接将被添加到导航中。')) {
      return;
    }

    const item = document.querySelector(`[data-id="${linkId}"]`);
    const approveBtn = item?.querySelector('.approve-btn');
    const rejectBtn = item?.querySelector('.reject-btn');

    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/pending-links/${linkId}/approve`, {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess('申请已同意，链接已添加到导航');
        // 重新加载列表
        this.loadPendingLinks(this.currentPageToken);
      } else {
        this.showError(result.message || '操作失败');
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
      }
    } catch (error) {
      console.error('同意申请异常:', error);
      this.showError('网络错误，请检查网络连接后重试');
      if (approveBtn) approveBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  }

  async rejectLink(linkId) {
    if (!confirm('确定要拒绝这个申请吗？此操作不可撤销。')) {
      return;
    }

    const item = document.querySelector(`[data-id="${linkId}"]`);
    const approveBtn = item?.querySelector('.approve-btn');
    const rejectBtn = item?.querySelector('.reject-btn');

    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/pending-links/${linkId}/reject`, {
        method: 'POST',
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess('申请已拒绝');
        // 重新加载列表
        this.loadPendingLinks(this.currentPageToken);
      } else {
        this.showError(result.message || '操作失败');
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
      }
    } catch (error) {
      console.error('拒绝申请异常:', error);
      this.showError('网络错误，请检查网络连接后重试');
      if (approveBtn) approveBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  }

  loadNextPage() {
    if (this.hasMore && this.currentPageToken) {
      this.loadPendingLinks(this.currentPageToken, true);
    }
  }

  loadPreviousPage() {
    // 从历史栈中获取上一页的token
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      const previousPageToken = this.pageHistory[this.currentPageIndex];
      this.loadPendingLinks(previousPageToken, false);
    }
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showMessage(message, type) {
    // 移除已存在的消息
    const existingMessages = document.querySelectorAll('.admin-review-message');
    existingMessages.forEach(msg => msg.remove());

    const messageElement = document.createElement('div');
    messageElement.className = `admin-review-message message ${type}`;
    messageElement.innerHTML = `
      <i class="bi ${type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle'}"></i>
      <span>${this.escapeHtml(message)}</span>
    `;

    // 添加到弹窗内容中
    const modalContent = document.querySelector('.admin-review-modal-content');
    if (modalContent) {
      modalContent.appendChild(messageElement);
    } else {
      document.body.appendChild(messageElement);
    }

    setTimeout(() => {
      messageElement.style.animation = 'fadeOutSlideOut 0.3s ease';
      setTimeout(() => {
        messageElement.remove();
      }, 300);
    }, type === 'success' ? 3000 : 5000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 导出管理员审核管理器
window.AdminReviewManager = AdminReviewManager;

