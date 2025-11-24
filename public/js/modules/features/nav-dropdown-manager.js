/**
 * 导航下拉菜单管理器 - 处理专业导航下拉菜单
 */
class NavDropdownManager {
  constructor() {
    this.currentTableId = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadBitableList();
  }

  // 绑定事件
  bindEvents() {
    const dropdown = document.querySelector('.nav-dropdown');
    const trigger = document.querySelector('.dropdown-trigger');
    
    if (!dropdown || !trigger) return;

    // 点击触发下拉菜单
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      dropdown.classList.toggle('active');
    });

    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });

    // ESC键关闭下拉菜单
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
      }
    });
  }

  // 加载多维表格列表
  async loadBitableList() {
    const menu = document.getElementById('bitable-dropdown-menu');
    if (!menu) return;

    menu.innerHTML = `
      <div class="dropdown-loading">
        <i class="bi bi-hourglass-split"></i>
        <span>加载中...</span>
      </div>
    `;

    try {
      const basePath = window.BASE_PATH || '';
      const response = await fetch(`${basePath}/api/bitables/available`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data && Array.isArray(result.data) && result.data.length > 0) {
        this.renderBitableList(result.data, menu);
      } else {
        menu.innerHTML = `
          <div class="dropdown-empty">
            <i class="bi bi-inbox"></i>
            <p>暂无可用表格</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('加载表格列表失败:', error);
      menu.innerHTML = `
        <div class="dropdown-empty">
          <i class="bi bi-exclamation-triangle"></i>
          <p>加载失败</p>
        </div>
      `;
    }
  }

  // 根据表格名获取合适的图标
  getTableIcon(tableName) {
    if (!tableName) return 'bi-table';
    
    const name = tableName.toLowerCase();
    
    // 根据关键词匹配图标
    if (name.includes('开发') || name.includes('代码') || name.includes('code') || name.includes('dev')) {
      return 'bi-code-square';
    } else if (name.includes('设计') || name.includes('design') || name.includes('ui') || name.includes('ux')) {
      return 'bi-palette';
    } else if (name.includes('产品') || name.includes('product') || name.includes('pm')) {
      return 'bi-diagram-3';
    } else if (name.includes('运营') || name.includes('operation') || name.includes('运营')) {
      return 'bi-graph-up';
    } else if (name.includes('市场') || name.includes('marketing') || name.includes('营销')) {
      return 'bi-megaphone';
    } else if (name.includes('数据') || name.includes('data') || name.includes('分析')) {
      return 'bi-bar-chart';
    } else if (name.includes('工具') || name.includes('tool') || name.includes('在线')) {
      return 'bi-tools';
    } else if (name.includes('ai') || name.includes('人工智能') || name.includes('智能')) {
      return 'bi-cpu';
    } else if (name.includes('学习') || name.includes('learn') || name.includes('教育')) {
      return 'bi-book';
    } else if (name.includes('资源') || name.includes('resource') || name.includes('素材')) {
      return 'bi-folder';
    } else if (name.includes('导航') || name.includes('nav') || name.includes('导航')) {
      return 'bi-compass';
    } else if (name.includes('默认') || name.includes('default')) {
      return 'bi-house-door';
    }
    
    // 默认图标
    return 'bi-table';
  }

  // 渲染表格列表
  renderBitableList(tables, menu) {
    // 添加默认表格选项

    const allTables = [...tables];

    const listHTML = allTables.map(table => {
      const isActive = this.currentTableId === table.table_id || 
                      (!this.currentTableId && table.table_id === 'tbl3I3RtxgtiC7eF');
      const iconClass = this.getTableIcon(table.table_name);
      return `
        <button class="dropdown-item ${isActive ? 'active' : ''}" 
                data-table-id="${this.escapeHtml(table.table_id)}"
                data-table-name="${this.escapeHtml(table.table_name || table.table_id)}">
          <i class="bi ${iconClass}"></i>
          <span>${this.escapeHtml(table.table_name || table.table_id)}</span>
        </button>
      `;
    }).join('');

    menu.innerHTML = listHTML;

    // 绑定点击事件
    const items = menu.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tableId = item.getAttribute('data-table-id');
        const tableName = item.getAttribute('data-table-name');
        this.selectTable(tableId, tableName);
        
        // 关闭下拉菜单
        const dropdown = document.querySelector('.nav-dropdown');
        if (dropdown) {
          dropdown.classList.remove('active');
        }
      });
    });
  }

  // 选择表格
  selectTable(tableId, tableName) {
    // 更新当前选中的表格ID
    this.currentTableId = tableId === 'tbl3I3RtxgtiC7eF' ? null : tableId;
    
    // 更新数据管理器的表格ID
    if (window.dataManager) {
      window.dataManager.setTableId(this.currentTableId);
    }

    // 更新下拉菜单中的活动状态
    const items = document.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      const itemTableId = item.getAttribute('data-table-id');
      if (itemTableId === tableId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 更新触发按钮文本（可选）
    const trigger = document.querySelector('.dropdown-trigger');
    if (trigger) {
      let triggerText = trigger.querySelector('span');
      if (!triggerText) {
        // 如果没有span，创建一个
        triggerText = document.createElement('span');
        const textNode = Array.from(trigger.childNodes).find(node => 
          node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );
        if (textNode) {
          triggerText.textContent = textNode.textContent.trim();
          textNode.replaceWith(triggerText);
        } else {
          trigger.insertBefore(triggerText, trigger.querySelector('i'));
        }
      }
      // 如果选中的是默认表格，不显示表格名
      if (tableId === 'tbl3I3RtxgtiC7eF') {
        triggerText.textContent = '专业导航';
      } else {
        triggerText.textContent = `${tableName}`;
      }
    }

    // 触发数据刷新事件
    window.dispatchEvent(new CustomEvent('tableChanged', {
      detail: { tableId: this.currentTableId, tableName: tableName }
    }));

    // 刷新导航数据
    if (window.dataManager) {
      window.dataManager.fetchNavigationData(true).then(() => {
        // 触发数据变化事件，让UI更新
        window.dispatchEvent(new CustomEvent('dataChanged'));
      });
    }
  }

  // 转义HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NavDropdownManager;
} else {
  window.NavDropdownManager = NavDropdownManager;
}

