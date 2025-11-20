/**
 * 验证管理器 - 处理用户身份验证
 */
class AuthManager {
  constructor() {
    this.authenticated = false;
    this.isLoginEventsBound = false;
    // 不在这里初始化，等待外部调用init方法
  }

  async init() {
    // 检查当前验证状态
    await this.checkAuthStatus();
    
    // 初始化登录功能（延迟一点确保DOM完全渲染）
    setTimeout(() => {
      this.initLoginFeature();
      // 更新UI状态
      this.updateUI();
    }, 300);
  }

  // 检查验证状态
  async checkAuthStatus() {
    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/auth/status`, {
        method: 'GET',
        credentials: 'include' // 重要：包含cookie以支持session
      });

      if (response.ok) {
        const result = await response.json();
        this.authenticated = result.authenticated || false;
      } else {
        this.authenticated = false;
      }
    } catch (error) {
      console.error('检查验证状态异常:', error);
      this.authenticated = false;
    }
  }

  // 初始化登录功能
  initLoginFeature() {
    const loginModal = document.getElementById('login-modal');
    const closeLoginModalBtn = document.getElementById('close-login-modal-btn');
    const cancelLoginBtn = document.getElementById('cancel-login-btn');
    const submitLoginBtn = document.getElementById('submit-login-btn');
    const loginForm = document.getElementById('login-form');
    const loginPasswordInput = document.getElementById('login-password');
    const modalOverlay = loginModal?.querySelector('.modal-overlay');
    const loginBtnMobile = document.getElementById('login-btn-mobile');
    const loginBtnDesktop = document.getElementById('login-btn-desktop');

    // 检查元素是否存在
    if (!loginModal || !closeLoginModalBtn || !cancelLoginBtn || !submitLoginBtn || !loginForm) {
      console.error('登录功能的DOM元素未找到', {
        loginModal: !!loginModal,
        closeLoginModalBtn: !!closeLoginModalBtn,
        cancelLoginBtn: !!cancelLoginBtn,
        submitLoginBtn: !!submitLoginBtn,
        loginForm: !!loginForm
      });
      // 如果关键元素不存在，延迟重试
      setTimeout(() => {
        if (!this.isLoginEventsBound) {
          this.initLoginFeature();
        }
      }, 500);
      return;
    }

    // 如果事件监听器已经绑定，直接返回
    if (this.isLoginEventsBound) {
      return;
    }

    // 绑定登录按钮事件
    if (loginBtnMobile) {
      loginBtnMobile.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.authenticated) {
          this.logout();
        } else {
          this.showLoginModal();
        }
      });
    } else {
      console.warn('移动端登录按钮未找到，将在500ms后重试');
      setTimeout(() => {
        const retryBtn = document.getElementById('login-btn-mobile');
        if (retryBtn && !this.isLoginEventsBound) {
          this.initLoginFeature();
        }
      }, 500);
    }

    if (loginBtnDesktop) {
      loginBtnDesktop.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.authenticated) {
          this.logout();
        } else {
          this.showLoginModal();
        }
      });
    } else {
      console.warn('桌面端登录按钮未找到，将在500ms后重试');
      setTimeout(() => {
        const retryBtn = document.getElementById('login-btn-desktop');
        if (retryBtn && !this.isLoginEventsBound) {
          this.initLoginFeature();
        }
      }, 500);
    }

    // 绑定模态框关闭事件 - 使用命名函数以便可以移除
    const handleCloseModal = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideLoginModal();
    };

    closeLoginModalBtn.addEventListener('click', handleCloseModal);
    cancelLoginBtn.addEventListener('click', handleCloseModal);
    
    if (modalOverlay) {
      modalOverlay.addEventListener('click', handleCloseModal);
    }

    // 绑定提交登录事件
    submitLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.submitLogin();
    });

    // 阻止模态框内容点击事件冒泡到遮罩层
    const modalContent = loginModal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // ESC键关闭模态框 - 使用命名函数并检查是否已绑定
    if (!this.escKeyHandler) {
      this.escKeyHandler = (e) => {
        if (e.key === 'Escape' && loginModal.classList.contains('active')) {
          this.hideLoginModal();
        }
      };
      document.addEventListener('keydown', this.escKeyHandler);
    }

    // 回车键提交登录
    if (loginPasswordInput) {
      loginPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitLogin();
        }
      });
    }

    // 标记事件监听器已绑定
    this.isLoginEventsBound = true;
  }

  // 显示登录模态框
  showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    const loginPasswordInput = document.getElementById('login-password');
    
    if (!loginModal) {
      console.error('登录模态框元素未找到');
      return;
    }

    loginModal.classList.add('active');
    loginModal.style.display = 'block'; // 强制显示
    document.body.style.overflow = 'hidden';

    // 清空表单和错误
    if (loginPasswordInput) {
      loginPasswordInput.value = '';
      loginPasswordInput.focus();
    }
    this.clearLoginError();

    // 聚焦到密码输入框
    setTimeout(() => {
      if (loginPasswordInput) {
        loginPasswordInput.focus();
      }
    }, 300);
  }

  // 隐藏登录模态框
  hideLoginModal() {
    console.log('hideLoginModal 被调用');
    const loginModal = document.getElementById('login-modal');
    if (!loginModal) {
      console.error('登录模态框元素未找到');
      return;
    }

    console.log('移除active类，当前类:', loginModal.className);
    loginModal.classList.remove('active');
    loginModal.style.display = 'none'; // 强制隐藏
    document.body.style.overflow = '';
    this.clearLoginError();
    console.log('模态框已隐藏');
  }

  // 清除登录错误提示
  clearLoginError() {
    const errorElement = document.getElementById('login-error');
    if (errorElement) {
      errorElement.textContent = '';
    }
  }

  // 显示登录错误提示
  showLoginError(message) {
    const errorElement = document.getElementById('login-error');
    if (errorElement) {
      errorElement.textContent = message;
    }
  }

  // 提交登录
  async submitLogin() {
    const loginPasswordInput = document.getElementById('login-password');
    const submitLoginBtn = document.getElementById('submit-login-btn');
    
    if (!loginPasswordInput) return;

    const password = loginPasswordInput.value.trim();

    if (!password) {
      this.showLoginError('请输入密码');
      return;
    }

    // 禁用提交按钮，防止重复提交
    if (submitLoginBtn) {
      submitLoginBtn.disabled = true;
      submitLoginBtn.textContent = '登录中...';
    }

    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // 重要：包含cookie以支持session
        body: JSON.stringify({ password })
      });

      const result = await response.json();

      if (result.success) {
        this.authenticated = true;
        this.hideLoginModal();
        this.updateUI();
        this.showSuccessMessage('登录成功');
        
        // 触发验证状态变更事件
        window.dispatchEvent(new CustomEvent('authStatusChanged', { 
          detail: { authenticated: true } 
        }));
      } else {
        this.showLoginError(result.message || '登录失败');
        if (loginPasswordInput) {
          loginPasswordInput.focus();
        }
      }
    } catch (error) {
      console.error('登录异常:', error);
      this.showLoginError('网络错误，请检查网络连接后重试');
    } finally {
      // 恢复提交按钮状态
      if (submitLoginBtn) {
        submitLoginBtn.disabled = false;
        submitLoginBtn.textContent = '登录';
      }
    }
  }

  // 登出
  async logout() {
    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include' // 重要：包含cookie以支持session
      });

      const result = await response.json();

      if (result.success) {
        this.authenticated = false;
        this.updateUI();
        this.showSuccessMessage('已登出');
        
        // 触发验证状态变更事件
        window.dispatchEvent(new CustomEvent('authStatusChanged', { 
          detail: { authenticated: false } 
        }));
      } else {
        this.showErrorMessage(result.message || '登出失败');
      }
    } catch (error) {
      console.error('登出异常:', error);
      this.showErrorMessage('网络错误，请检查网络连接后重试');
    }
  }

  // 更新UI状态
  updateUI() {
    const loginBtnMobile = document.getElementById('login-btn-mobile');
    const loginBtnDesktop = document.getElementById('login-btn-desktop');
    const loginStatusText = document.getElementById('login-status-text');

    // 更新移动端按钮
    if (loginBtnMobile) {
      if (this.authenticated) {
        loginBtnMobile.innerHTML = '<i class="bi bi-unlock"></i>';
        loginBtnMobile.title = '登出';
        loginBtnMobile.classList.add('authenticated');
      } else {
        loginBtnMobile.innerHTML = '<i class="bi bi-lock"></i>';
        loginBtnMobile.title = '登录';
        loginBtnMobile.classList.remove('authenticated');
      }
    }

    // 更新桌面端按钮
    if (loginBtnDesktop) {
      const icon = loginBtnDesktop.querySelector('i');
      let statusText = loginBtnDesktop.querySelector('#login-status-text');
      
      if (this.authenticated) {
        if (icon) {
          icon.className = 'bi bi-unlock';
        }
        if (!statusText) {
          statusText = document.createElement('span');
          statusText.id = 'login-status-text';
          loginBtnDesktop.appendChild(statusText);
        }
        statusText.textContent = '已登录';
        loginBtnDesktop.title = '登出';
        loginBtnDesktop.classList.add('authenticated');
      } else {
        if (icon) {
          icon.className = 'bi bi-lock';
        }
        if (!statusText) {
          statusText = document.createElement('span');
          statusText.id = 'login-status-text';
          loginBtnDesktop.appendChild(statusText);
        }
        statusText.textContent = '登录';
        loginBtnDesktop.title = '登录';
        loginBtnDesktop.classList.remove('authenticated');
      }
    }
  }

  // 检查是否需要验证（在增删改操作前调用）
  async requireAuth() {
    // 先检查当前状态
    await this.checkAuthStatus();

    if (!this.authenticated) {
      // 显示登录模态框
      this.showLoginModal();
      return false;
    }

    return true;
  }

  // 显示成功消息
  showSuccessMessage(message) {
    // 移除已存在的成功消息
    const existingMessages = document.querySelectorAll('.success-message');
    existingMessages.forEach(msg => msg.remove());

    const messageElement = document.createElement('div');
    messageElement.className = 'success-message';
    messageElement.innerHTML = `
      <i class="bi bi-check-circle"></i>
      <span>${message}</span>
    `;

    // 添加样式
    Object.assign(messageElement.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: '#52c41a',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: '1005',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      animation: 'fadeInSlideIn 0.3s ease',
      maxWidth: '300px'
    });

    // 添加到页面
    document.body.appendChild(messageElement);

    // 3秒后自动移除
    setTimeout(() => {
      messageElement.style.animation = 'fadeOutSlideOut 0.3s ease';
      setTimeout(() => {
        messageElement.remove();
      }, 300);
    }, 3000);
  }

  // 显示错误消息
  showErrorMessage(message) {
    // 移除已存在的错误消息
    const existingMessages = document.querySelectorAll('.error-message');
    existingMessages.forEach(msg => msg.remove());

    const messageElement = document.createElement('div');
    messageElement.className = 'error-message';
    messageElement.innerHTML = `
      <i class="bi bi-exclamation-circle"></i>
      <span>${message}</span>
    `;

    // 添加样式
    Object.assign(messageElement.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: '#ff4d4f',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: '1005',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      animation: 'fadeInSlideIn 0.3s ease',
      maxWidth: '300px'
    });

    // 添加到页面
    document.body.appendChild(messageElement);

    // 5秒后自动移除
    setTimeout(() => {
      messageElement.style.animation = 'fadeOutSlideOut 0.3s ease';
      setTimeout(() => {
        messageElement.remove();
      }, 300);
    }, 5000);
  }
}

// 导出验证管理器
window.AuthManager = AuthManager;

