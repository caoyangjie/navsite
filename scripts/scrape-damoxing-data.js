/**
 * 从 https://openi.cn/ 抓取大模型导航数据
 * 抓取所有大模型相关的tab数据，统一分类为"AI大模型"
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
 * 从 openi.cn 抓取大模型导航数据
 */
async function scrapeDamoxingData() {
  try {
    console.log('开始抓取 https://openi.cn/ 的大模型导航数据...\n');

    // 尝试多个可能的URL
    const urlsToTry = [
      'https://openi.cn/',
      'https://openi.cn/favorites/5114.html', // 大模型分类页面
    ];

    let response;
    let html = '';
    
    // 尝试访问每个URL
    for (const url of urlsToTry) {
      try {
        console.log(`尝试访问: ${url}`);
        response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 30000
        });
        html = response.data;
        console.log(`✓ 成功访问: ${url}\n`);
        break;
      } catch (error) {
        console.log(`✗ 访问失败: ${url} - ${error.message}`);
        continue;
      }
    }

    if (!html) {
      throw new Error('无法访问任何URL');
    }

    const $ = cheerio.load(html);
    const allLinks = [];
    const seenUrls = new Set();

    // 查找"大模型"导航区域
    // 根据网页结构，大模型部分可能有特定的标识
    // 尝试多种选择器来定位大模型区域
    
    // 方法1: 查找包含"大模型"文本的导航项
    const $damoxingNav = $('li.nav-item').filter((i, el) => {
      const text = $(el).text();
      return text.includes('大模型');
    });

    console.log(`找到 ${$damoxingNav.length} 个大模型导航项\n`);

    if ($damoxingNav.length === 0) {
      // 方法2: 尝试查找所有可能的tab按钮
      console.log('尝试查找所有tab按钮...');
      const $allTabs = $('li.nav-item[data-action="load_home_tab"], a.nav-link[href^="#tab-"]');
      console.log(`找到 ${$allTabs.length} 个tab按钮`);
      
      // 保存HTML用于调试
      fs.writeFileSync(
        path.join(outputDir, 'debug-damoxing-html.html'),
        response.data,
        'utf-8'
      );
      console.log('HTML 已保存到:', path.join(outputDir, 'debug-damoxing-html.html'));
    }

    // 查找大模型相关的tab内容
    // 根据网页搜索结果，大模型部分包含多个tab：体验入口、API、DeepSeek、ChatGPT等
    const damoxingTabs = [
      '体验入口', 'API', 'DeepSeek', 'ChatGPT', '百度', '阿里', 
      '月之暗面', '讯飞', 'ChatGLM', '腾讯', '抖音', '百川', 
      '天工', '紫东太初', '封神榜', 'Llama', '元语', '盘古', 
      '快手', '书生', 'MOSS', '更多大模型'
    ];

    // 查找所有 tab 按钮
    const $tabButtons = $('li.nav-item[data-action="load_home_tab"][data-taxonomy="favorites"]');
    
    console.log(`找到 ${$tabButtons.length} 个 tab 按钮\n`);

    // 遍历每个 tab 按钮，查找大模型相关的tab
    $tabButtons.each((index, element) => {
      const $tab = $(element);
      const $link = $tab.find('a.nav-link');
      const tabName = $link.text().trim();
      
      // 检查是否是大模型相关的tab
      const isDamoxingTab = damoxingTabs.some(dt => tabName.includes(dt) || dt.includes(tabName));
      
      if (!isDamoxingTab && !tabName.includes('大模型')) {
        return; // 跳过非大模型相关的tab
      }

      // 获取 tab ID
      const tabHref = $link.attr('href');
      let contentTabId = null;
      if (tabHref && tabHref.startsWith('#')) {
        contentTabId = tabHref.substring(1);
      }

      if (!contentTabId) {
        console.log(`跳过 ${tabName}: 无法确定内容区域 ID`);
        return;
      }

      // 查找对应的内容区域
      const $content = $(`#${contentTabId}.tab-pane`);
      
      if ($content.length === 0) {
        console.log(`跳过 ${tabName}: 未找到内容区域 (${contentTabId})`);
        return;
      }

      console.log(`处理 Tab: ${tabName}`);

      // 从内容区域提取所有网站链接
      // 尝试多种选择器来匹配不同的HTML结构
      const selectors = [
        '.url-card a.card[data-url]',
        '.url-card a[data-url]',
        '.card[data-url]',
        'a.card[data-url]',
        'a[data-url]',
        '.site-card a',
        '.url-item a'
      ];

      selectors.forEach(selector => {
        $content.find(selector).each((i, link) => {
          const $siteLink = $(link);
          
          // 获取网站名称 - 尝试多种方式
          let name = '';
          const nameSelectors = [
            '.url-info strong',
            '.url-info .text-sm strong',
            'strong',
            '.card-title',
            '.site-name',
            '.name',
            'span[class*="name"]'
          ];
          
          for (const nameSel of nameSelectors) {
            const $nameEl = $siteLink.find(nameSel);
            if ($nameEl.length > 0) {
              name = $nameEl.first().text().trim();
              break;
            }
          }
          
          // 如果没找到名称，尝试从父元素或属性获取
          if (!name) {
            name = $siteLink.attr('title') || 
                   $siteLink.attr('data-name') || 
                   $siteLink.closest('.url-card, .card').find('strong, .card-title').first().text().trim() ||
                   '';
          }

          // 获取网站 URL
          let url = $siteLink.attr('data-url') || 
                   $siteLink.attr('href') ||
                   $siteLink.attr('data-href') ||
                   '';
          
          // 获取描述 - 尝试多种方式
          let description = '';
          const descSelectors = [
            '.url-info p.text-muted',
            '.url-info .text-xs',
            '.description',
            'p.text-muted',
            '.text-muted',
            '.desc',
            'p'
          ];
          
          for (const descSel of descSelectors) {
            const $descEl = $siteLink.find(descSel);
            if ($descEl.length > 0) {
              description = $descEl.first().text().trim();
              break;
            }
          }
          
          if (!description) {
            description = $siteLink.attr('title') || 
                         $siteLink.attr('data-description') ||
                         $siteLink.closest('.url-card, .card').find('p, .description').first().text().trim() ||
                         '';
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
              !fullUrl.includes('openi.cn/sites/') && 
              !fullUrl.includes('javascript:') &&
              name.length < 200) {
            
            // 去重（基于 URL）
            const normalizedUrl = fullUrl.split('?')[0].split('#')[0].toLowerCase();
            if (!seenUrls.has(normalizedUrl)) {
              seenUrls.add(normalizedUrl);
              allLinks.push({
                name: name,
                url: fullUrl,
                description: description || ''
              });
            }
          }
        });
      });

      console.log(`  ✓ ${tabName}: 提取了链接（去重后共 ${allLinks.length} 个）`);
    });

    // 如果没找到数据，尝试直接查找所有包含大模型关键词的链接
    if (allLinks.length === 0) {
      console.log('\n未找到数据，尝试直接查找链接...');
      
      // 查找所有可能的链接卡片
      $('.url-card, .card[data-url], a[data-url]').each((i, el) => {
        const $el = $(el);
        const $link = $el.is('a[data-url]') ? $el : $el.find('a[data-url], a').first();
        
        if ($link.length === 0) return;
        
        const name = $link.find('strong, .card-title').text().trim() || $link.attr('title') || '';
        const url = $link.attr('data-url') || $link.attr('href') || '';
        
        if (name && url && url.startsWith('http')) {
          const normalizedUrl = url.split('?')[0].split('#')[0];
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            allLinks.push({
              name: name,
              url: url,
              description: ''
            });
          }
        }
      });
    }

    if (allLinks.length === 0) {
      console.log('\n未找到有效的大模型导航数据。');
      console.log('请检查网站结构是否发生变化。');
      console.log('已保存HTML到:', path.join(outputDir, 'debug-damoxing-html.html'));
      return;
    }

    // 统一分类为"AI大模型"
    const data = {
      'AI大模型': allLinks
    };

    // 保存数据
    const fileName = 'AI大模型.json';
    const filePath = path.join(outputDir, fileName);
    
    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`\n✓ 已保存: ${fileName} (${allLinks.length} 个链接)`);
    console.log(`数据保存在: ${filePath}`);

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
    await scrapeDamoxingData();
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

module.exports = { scrapeDamoxingData };

