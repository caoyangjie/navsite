/**
 * 从 https://openi.cn/ 抓取所有导航数据
 * 按照 tab 名保存到不同的 JSON 文件中
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 创建输出目录
const outputDir = path.join(__dirname, 'openi-data');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * 清理文件名，移除非法字符
 */
function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * 从 openi.cn 抓取导航数据
 */
async function scrapeOpeniData() {
  try {
    console.log('开始抓取 https://openi.cn/ 的数据...\n');

    // 获取主页 HTML
    const response = await axios.get('https://openi.cn/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    const tabsData = {};

    // 查找所有 tab 按钮（根据实际 HTML 结构）
    // Tab 按钮有 data-action="load_home_tab" 和 data-taxonomy="favorites" 属性
    const $tabButtons = $('li.nav-item[data-action="load_home_tab"][data-taxonomy="favorites"]');
    
    console.log(`找到 ${$tabButtons.length} 个 tab 按钮\n`);

    if ($tabButtons.length === 0) {
      console.log('未找到 tab 按钮，尝试其他方法...');
      // 保存 HTML 用于调试
      fs.writeFileSync(
        path.join(outputDir, 'debug-html.html'),
        response.data,
        'utf-8'
      );
      console.log('HTML 已保存到:', path.join(outputDir, 'debug-html.html'));
      return;
    }

    // 遍历每个 tab 按钮
    $tabButtons.each((index, element) => {
      const $tab = $(element);
      const $link = $tab.find('a.nav-link');
      
      // 获取 tab 名称（链接文本）
      const tabName = $link.text().trim();
      
      if (!tabName || tabName.length === 0) {
        return; // 跳过空名称
      }

      // 获取 tab ID（用于查找对应的内容区域）
      const tabId = $tab.attr('data-id');
      const tabHref = $link.attr('href');
      
      // 从 href 中提取 tab ID（格式：#tab-113099-166746）
      let contentTabId = null;
      if (tabHref && tabHref.startsWith('#')) {
        contentTabId = tabHref.substring(1); // 移除 #
      } else if (tabId) {
        // 尝试构建 tab ID（需要找到父级 ID）
        const parentId = $tab.closest('[data-id]').attr('data-id') || '113099';
        contentTabId = `tab-${parentId}-${tabId}`;
      }

      if (!contentTabId) {
        console.log(`跳过 ${tabName}: 无法确定内容区域 ID`);
        return;
      }

      // 查找对应的内容区域（tab-pane）
      const $content = $(`#${contentTabId}.tab-pane`);
      
      if ($content.length === 0) {
        console.log(`跳过 ${tabName}: 未找到内容区域 (${contentTabId})`);
        return;
      }

      const links = [];

      // 从内容区域提取所有网站链接
      $content.find('.url-card').each((i, card) => {
        const $card = $(card);
        const $siteLink = $card.find('a.card[data-url]');
        
        if ($siteLink.length === 0) {
          return; // 跳过没有 data-url 的卡片
        }

        // 获取网站名称
        const $nameEl = $siteLink.find('.url-info strong, .url-info .text-sm strong');
        const name = $nameEl.text().trim();
        
        // 获取网站 URL
        const url = $siteLink.attr('data-url');
        
        // 获取描述
        const $descEl = $siteLink.find('.url-info p.text-muted, .url-info .text-xs');
        let description = $descEl.text().trim();
        
        // 如果没有找到描述，尝试从 title 属性获取
        if (!description) {
          description = $siteLink.attr('title') || '';
        }

        // 确保 URL 是完整的
        let fullUrl = url;
        if (url && !url.startsWith('http')) {
          if (url.startsWith('//')) {
            fullUrl = 'https:' + url;
          } else if (url.startsWith('/')) {
            fullUrl = 'https://openi.cn' + url;
          } else {
            fullUrl = 'https://openi.cn/' + url;
          }
        }

        // 只添加有效的链接
        if (name && name.length > 0 && fullUrl && fullUrl.startsWith('http') && 
            !fullUrl.includes('openi.cn/sites/') && name.length < 200) {
          links.push({
            name: name,
            url: fullUrl,
            description: description || ''
          });
        }
      });

      // 去重（基于 URL）
      const uniqueLinks = [];
      const seenUrls = new Set();
      links.forEach(link => {
        const normalizedUrl = link.url.split('?')[0].split('#')[0]; // 移除查询参数和锚点
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          uniqueLinks.push(link);
        }
      });

      if (uniqueLinks.length > 0) {
        tabsData[tabName] = uniqueLinks;
        console.log(`✓ 找到 Tab: ${tabName}, 包含 ${uniqueLinks.length} 个链接`);
      } else {
        console.log(`⚠ ${tabName}: 未找到有效链接`);
      }
    });

    // 如果没找到数据
    if (Object.keys(tabsData).length === 0) {
      console.log('\n未找到有效的导航数据。');
      console.log('请检查网站结构是否发生变化。');
      return;
    }

    // 按照 tab 名保存到不同的 JSON 文件
    console.log('\n开始保存数据到文件...\n');
    let totalLinks = 0;

    for (const [tabName, links] of Object.entries(tabsData)) {
      const fileName = sanitizeFileName(tabName) + '.json';
      const filePath = path.join(outputDir, fileName);
      
      // 按照示例格式保存
      const data = {
        [tabName]: links
      };
      
      fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      
      console.log(`✓ 已保存: ${fileName} (${links.length} 个链接)`);
      totalLinks += links.length;
    }

    console.log(`\n完成！共抓取 ${Object.keys(tabsData).length} 个分类，${totalLinks} 个链接`);
    console.log(`数据保存在: ${outputDir}`);

  } catch (error) {
    console.error('抓取数据时出错:', error.message);
    if (error.response) {
      console.error('HTTP 状态码:', error.response.status);
      console.error('响应数据:', error.response.data ? error.response.data.substring(0, 500) : '无数据');
    }
    throw error;
  }
}

// 主函数
async function main() {
  try {
    await scrapeOpeniData();
    process.exit(0);
  } catch (error) {
    console.error('\n抓取失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { scrapeOpeniData };
