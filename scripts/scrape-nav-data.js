/**
 * 通用导航数据爬取脚本
 * 支持通过命令行参数指定URL和类别
 * 
 * 使用方法:
 *   node scripts/scrape-nav-data.js --url https://openi.cn/ --categories "体验入口,API,DeepSeek"
 *   node scripts/scrape-nav-data.js --url https://openi.cn/ --categories "体验入口" --merge --output-category "AI大模型"
 *   node scripts/scrape-nav-data.js --url https://openi.cn/ --all
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  outputDir: path.join(__dirname, 'openi-data'),
  tabButtonSelector: 'li.nav-item[data-action="load_home_tab"][data-taxonomy="favorites"]',
  // 优先查找 class 值为 "url-body default" 的 div 元素
  urlBodySelector: 'div.url-body.default',
  linkSelectors: [
    '.url-card a.card[data-url]',
    '.url-card a[data-url]',
    '.card[data-url]',
    'a.card[data-url]',
    'a[data-url]'
  ],
  nameSelectors: [
    '.url-info strong',
    '.url-info .text-sm strong',
    'strong',
    '.card-title',
    '.site-name',
    '.name'
  ],
  descSelectors: [
    '.url-info p.text-muted',
    '.url-info .text-xs',
    '.description',
    'p.text-muted',
    '.text-muted',
    'p'
  ],
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  followRedirects: true, // 是否跟随重定向获取最终URL
  redirectTimeout: 10000 // 重定向超时时间
};

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    urls: [],
    categories: [],
    all: false,
    merge: false,
    outputCategory: null,
    outputDir: DEFAULT_CONFIG.outputDir,
    tabButtonSelector: DEFAULT_CONFIG.tabButtonSelector,
    linkSelectors: DEFAULT_CONFIG.linkSelectors,
    nameSelectors: DEFAULT_CONFIG.nameSelectors,
    descSelectors: DEFAULT_CONFIG.descSelectors,
    baseUrl: null,
    debug: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--url' || arg === '-u') {
      const url = args[++i];
      if (url) {
        config.urls.push(url);
      }
    } else if (arg === '--categories' || arg === '-c') {
      const categories = args[++i];
      if (categories) {
        config.categories = categories.split(',').map(c => c.trim()).filter(c => c);
      }
    } else if (arg === '--all' || arg === '-a') {
      config.all = true;
    } else if (arg === '--merge' || arg === '-m') {
      config.merge = true;
    } else if (arg === '--output-category' || arg === '-o') {
      config.outputCategory = args[++i];
    } else if (arg === '--output-dir' || arg === '-d') {
      config.outputDir = args[++i];
    } else if (arg === '--base-url' || arg === '-b') {
      config.baseUrl = args[++i];
    } else if (arg === '--debug') {
      config.debug = true;
    } else if (arg === '--no-redirect') {
      config.followRedirects = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // 如果没有指定URL，使用默认值
  if (config.urls.length === 0) {
    config.urls = ['https://openi.cn/'];
  }

  return config;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
通用导航数据爬取脚本

使用方法:
  node scripts/scrape-nav-data.js [选项]

选项:
  -u, --url <url>              要爬取的URL（可多次指定多个URL）
  -c, --categories <categories> 要抓取的类别，用逗号分隔（如："体验入口,API,DeepSeek"）
  -a, --all                     抓取所有类别
  -m, --merge                   合并所有类别到一个文件
  -o, --output-category <name>  合并后的分类名称（需要配合--merge使用）
  -d, --output-dir <dir>        输出目录（默认: scripts/openi-data）
  -b, --base-url <url>          URL相对路径的基础URL（用于补全相对链接）
  --debug                       保存HTML用于调试
  --no-redirect                 不跟随重定向获取最终URL（默认会跟随重定向）
  -h, --help                    显示帮助信息

示例:
  # 抓取指定类别
  node scripts/scrape-nav-data.js --url https://openi.cn/ --categories "体验入口,API"
  
  # 抓取所有类别
  node scripts/scrape-nav-data.js --url https://openi.cn/ --all
  
  # 抓取指定类别并合并为一个分类
  node scripts/scrape-nav-data.js --url https://openi.cn/ --categories "体验入口,API" --merge --output-category "AI大模型"
  
  # 尝试多个URL
  node scripts/scrape-nav-data.js --url https://openi.cn/ --url https://openi.cn/favorites/5114.html --categories "体验入口"
`);
}

/**
 * 清理文件名，移除非法字符
 */
function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * 获取HTML内容
 */
async function fetchHtml(urls, config) {
  for (const url of urls) {
    try {
      console.log(`尝试访问: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': config.userAgent
        },
        timeout: config.timeout
      });
      console.log(`✓ 成功访问: ${url}\n`);
      return { html: response.data, url };
    } catch (error) {
      console.log(`✗ 访问失败: ${url} - ${error.message}`);
      continue;
    }
  }
  throw new Error('无法访问任何URL');
}

/**
 * 获取重定向后的最终URL
 */
async function getRedirectUrl(url, config) {
  if (!config.followRedirects || !url || !url.startsWith('http')) {
    return url;
  }

  try {
    // 如果是 openi.cn/go/?url=xxx 格式，需要先解码base64
    if (url.includes('openi.cn/go/?url=')) {
      const urlParam = url.split('openi.cn/go/?url=')[1];
      if (urlParam) {
        try {
          // 解码base64
          const decodedUrl = Buffer.from(urlParam, 'base64').toString('utf-8');
          // 如果解码成功，使用解码后的URL
          if (decodedUrl && decodedUrl.startsWith('http')) {
            url = decodedUrl;
          }
        } catch (e) {
          // base64解码失败，继续使用原URL
        }
      }
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': config.userAgent
      },
      timeout: config.redirectTimeout || 10000,
      maxRedirects: 10, // 最多跟随10次重定向
      validateStatus: function (status) {
        return status >= 200 && status < 400; // 允许重定向状态码
      }
    });
    
    // 返回最终URL
    const finalUrl = response.request.res.responseUrl || response.request.responseUrl || response.request.res.responseUrl || url;
    return finalUrl;
  } catch (error) {
    // 如果获取重定向失败，返回原始URL
    console.warn(`获取重定向URL失败: ${url} - ${error.message}`);
    return url;
  }
}

/**
 * 提取链接信息
 */
function extractLinkInfo($, $siteLink, config, baseUrl) {
  // 获取网站名称
  let name = '';
  for (const nameSel of config.nameSelectors) {
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
  
  // 获取描述
  let description = '';
  for (const descSel of config.descSelectors) {
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
      fullUrl = (baseUrl || 'https://openi.cn') + url;
    } else {
      fullUrl = (baseUrl || 'https://openi.cn') + '/' + url;
    }
  }

  return { name, url: fullUrl, description };
}

/**
 * 从 url-body default 元素中提取链接信息
 */
function extractFromUrlBody($, $urlBody, config, baseUrl) {
  // 查找"链接直达"的链接（class为 togo 的链接）
  let directLink = null;
  
  // 优先查找 class="togo" 的链接（这是"链接直达"按钮）
  // 这个链接会跳转到最终的目标URL
  // 注意：togo 链接可能在 url-body div 的直接子元素中，也可能在更深层
  let $togoLink = $urlBody.find('a.togo').first();
  
  // 如果没找到，尝试查找所有 a 标签，然后筛选 class 包含 togo 的
  if ($togoLink.length === 0) {
    $urlBody.find('a').each((i, el) => {
      const $a = $(el);
      const classes = ($a.attr('class') || '').trim();
      if (classes.includes('togo')) {
        $togoLink = $a;
        return false; // 跳出循环
      }
    });
  }
  
  if ($togoLink.length > 0) {
    directLink = $togoLink.attr('href');
    // togo 链接通常是 openi.cn/go/?url=xxx 格式，需要获取重定向后的最终URL
  }
  
  // 如果没找到 togo 链接，尝试查找主链接的 data-url 属性（这是真实URL）
  if (!directLink) {
    const $mainLink = $urlBody.find('a.card, a[data-url]').first();
    if ($mainLink.length > 0) {
      // 优先使用 data-url（这是真实URL），如果没有则使用 href
      directLink = $mainLink.attr('data-url') || $mainLink.attr('href');
    }
  }
  
  // 如果还是没找到，尝试查找所有a标签，选择第一个
  if (!directLink) {
    const $firstLink = $urlBody.find('a').first();
    if ($firstLink.length > 0) {
      directLink = $firstLink.attr('href') || $firstLink.attr('data-url') || $firstLink.attr('data-href');
    }
  }
  
  // 如果还是没找到，尝试查找 data-url 属性
  if (!directLink) {
    directLink = $urlBody.attr('data-url') || $urlBody.find('[data-url]').first().attr('data-url');
  }
  
  // 获取网站名称
  let name = '';
  for (const nameSel of config.nameSelectors) {
    const $nameEl = $urlBody.find(nameSel);
    if ($nameEl.length > 0) {
      name = $nameEl.first().text().trim();
      break;
    }
  }
  
  // 如果没找到名称，尝试从父元素获取
  if (!name) {
    name = $urlBody.find('strong, .card-title, .site-name, .name, h3, h4').first().text().trim() || 
           $urlBody.attr('title') || 
           $urlBody.attr('data-name') || '';
  }
  
  // 获取描述
  let description = '';
  for (const descSel of config.descSelectors) {
    const $descEl = $urlBody.find(descSel);
    if ($descEl.length > 0) {
      description = $descEl.first().text().trim();
      break;
    }
  }
  
  if (!description) {
    description = $urlBody.find('p, .description, .desc').first().text().trim() || '';
  }
  
  // 确保 URL 是完整的
  let fullUrl = directLink;
  if (directLink && !directLink.startsWith('http')) {
    if (directLink.startsWith('//')) {
      fullUrl = 'https:' + directLink;
    } else if (directLink.startsWith('/')) {
      fullUrl = (baseUrl || 'https://openi.cn') + directLink;
    } else {
      fullUrl = (baseUrl || 'https://openi.cn') + '/' + directLink;
    }
  }
  
  return { name, url: fullUrl, description };
}

/**
 * 从内容区域提取链接
 */
async function extractLinksFromContent($, $content, config, baseUrl) {
  const links = [];
  const seenUrls = new Set();

  // 优先查找所有 class 值为 "url-body default" 的 div 元素
  // 每个这样的 div 元素就是一条导航数据
  // 直接从内容区域查找所有 div，然后过滤出符合条件的
  let $urlBodies = $content.find('div').filter((i, el) => {
    // 确保是 div 元素
    if (!el || el.tagName !== 'DIV') return false;
    
    // 获取 class 属性
    const classes = ($(el).attr('class') || '').trim();
    
    // 必须同时包含 url-body 和 default 两个 class（使用单词边界匹配，避免误匹配）
    const hasUrlBody = /\burl-body\b/.test(classes);
    const hasDefault = /\bdefault\b/.test(classes);
    
    return hasUrlBody && hasDefault;
  });
  
  console.log("extractLinksFromContent: urlBodies.length:", $urlBodies.length);
  // 如果没找到，尝试在整个文档中查找（某些情况下内容可能是动态加载的）
  if ($urlBodies.length === 0) {
    // 尝试使用标准选择器
    const selector = config.urlBodySelector || 'div.url-body.default';
    $urlBodies = $content.find(selector);
  }
  
  if ($urlBodies.length > 0) {
    console.log(`  找到 ${$urlBodies.length} 个 class="url-body default" 的 div 元素`);
    
    // 处理每个 url-body default div 元素（每个都是一条导航数据）
    let processedCount = 0;
    let skippedCount = 0;
    const skipReasons = { noName: 0, noUrl: 0, invalidUrl: 0, javascript: 0, nameTooLong: 0, duplicate: 0 };
    
    // 将 cheerio 对象转换为数组，确保可以正常遍历
    const urlBodiesArray = $urlBodies.toArray();
    
    for (let i = 0; i < urlBodiesArray.length; i++) {
      const urlBodyEl = urlBodiesArray[i];
      const $urlBody = $(urlBodyEl);
      
      // 确保是 div 元素（cheerio 中 tagName 可能是小写）
      if (!urlBodyEl) {
        continue;
      }
      
      const tagName = urlBodyEl.tagName || (urlBodyEl.name || '').toUpperCase();
      if (tagName !== 'DIV' && tagName !== 'div') {
        continue;
      }
      
      const linkInfo = extractFromUrlBody($, $urlBody, config, baseUrl);
      
      const { name, url: fullUrl, description } = linkInfo;
      
      
      if (!name || name.length === 0) {
        skippedCount++;
        skipReasons.noName++;
        continue; // 跳过没有名称的
      }
      
      if (!fullUrl || !fullUrl.startsWith('http')) {
        skippedCount++;
        skipReasons.noUrl++;
        continue; // 跳过无效URL
      }
      
      if (fullUrl.includes('javascript:')) {
        skippedCount++;
        skipReasons.javascript++;
        continue; // 跳过javascript链接
      }
      
      if (name.length >= 200) {
        skippedCount++;
        skipReasons.nameTooLong++;
        continue; // 跳过名称过长的
      }
      
      processedCount++;
      
      // 获取重定向后的最终URL
      let finalUrl = fullUrl;
      if (config.followRedirects && fullUrl) {
        try {
          finalUrl = await getRedirectUrl(fullUrl, config);
          // 如果获取失败，使用原始URL
          if (!finalUrl) {
            finalUrl = fullUrl;
          }
        } catch (error) {
          // 重定向失败，使用原始URL
          finalUrl = fullUrl;
        }
      }
      
      // 去重（基于 URL）
      const normalizedUrl = finalUrl.split('?')[0].split('#')[0].toLowerCase();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        links.push({
          name: name,
          url: finalUrl,
          description: description || ''
        });
      } else {
        // 已存在，跳过
        skipReasons.duplicate++;
      }
    }
    
    if (skippedCount > 0 || Object.values(skipReasons).some(v => v > 0)) {
      console.log(`  处理了 ${processedCount} 个，跳过了 ${skippedCount} 个无效链接`);
      if (skipReasons.noName > 0) console.log(`    - 无名称: ${skipReasons.noName}`);
      if (skipReasons.noUrl > 0) console.log(`    - 无URL: ${skipReasons.noUrl}`);
      if (skipReasons.duplicate > 0) console.log(`    - 重复: ${skipReasons.duplicate}`);
    }
  }
  
  // 如果没找到 url-body default div 元素，使用原有的选择器
  if (links.length === 0 && $urlBodies.length === 0) {
    console.log(`  未找到 class="url-body default" 的 div 元素，使用备用选择器`);
    
    // 尝试所有链接选择器
    for (const selector of config.linkSelectors) {
      const $foundLinks = $content.find(selector);
      if ($foundLinks.length > 0) {
        for (let i = 0; i < $foundLinks.length; i++) {
          const $siteLink = $($foundLinks[i]);
          const linkInfo = extractLinkInfo($, $siteLink, config, baseUrl);
          
          const { name, url: fullUrl, description } = linkInfo;

          // 只添加有效的链接
          if (name && name.length > 0 && fullUrl && fullUrl.startsWith('http') && 
              !fullUrl.includes('javascript:') &&
              name.length < 200) {
            
            // 获取重定向后的最终URL
            let finalUrl = fullUrl;
            if (config.followRedirects && fullUrl) {
              try {
                finalUrl = await getRedirectUrl(fullUrl, config);
                // 如果获取失败，使用原始URL
                if (!finalUrl) {
                  finalUrl = fullUrl;
                }
              } catch (error) {
                console.warn(`  警告: 获取重定向失败 ${name}: ${error.message}`);
                finalUrl = fullUrl;
              }
            }
            
            // 去重（基于 URL）
            const normalizedUrl = finalUrl.split('?')[0].split('#')[0].toLowerCase();
            if (!seenUrls.has(normalizedUrl)) {
              seenUrls.add(normalizedUrl);
              links.push({
                name: name,
                url: finalUrl,
                description: description || ''
              });
            }
          }
        }
        break; // 找到链接后停止尝试其他选择器
      }
    }
  }

  return links;
}

/**
 * 获取tab内容区域
 */
function getTabContent($, tabName, $tab, config) {
  const $link = $tab.find('a.nav-link');
  const tabHref = $link.attr('href');
  
  // 从 href 中提取 tab ID（格式：#tab-113099-166746）
  let contentTabId = null;
  if (tabHref && tabHref.startsWith('#')) {
    contentTabId = tabHref.substring(1); // 移除 #
  } else {
    const tabId = $tab.attr('data-id');
    if (tabId) {
      const parentId = $tab.closest('[data-id]').attr('data-id') || '113099';
      contentTabId = `tab-${parentId}-${tabId}`;
    }
  }

  if (!contentTabId) {
    return null;
  }

  // 查找对应的内容区域（tab-pane）
  const $content = $(`#${contentTabId}.tab-pane`);
  
  if ($content.length === 0) {
    return null;
  }

  return $content;
}

/**
 * 爬取导航数据
 */
async function scrapeNavData(config) {
  try {
    console.log('开始爬取导航数据...\n');
    console.log(`URL: ${config.urls.join(', ')}`);
    console.log(`输出目录: ${config.outputDir}\n`);

    // 获取HTML
    const { html, url: accessedUrl } = await fetchHtml(config.urls, config);
    const baseUrl = config.baseUrl || new URL(accessedUrl).origin;

    // 保存HTML用于调试
    if (config.debug) {
      const debugFile = path.join(config.outputDir, 'debug-html.html');
      fs.writeFileSync(debugFile, html, 'utf-8');
      console.log(`调试HTML已保存到: ${debugFile}\n`);
    }

    const $ = cheerio.load(html);

    // 创建输出目录
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // 直接从整个HTML中查找所有 class 为 "url-body default" 的 div 元素
    console.log('正在查找所有 div.url-body.default 元素...\n');
    
    let $urlBodies = $('div').filter((i, el) => {
      // 确保是 div 元素
      if (!el || el.tagName !== 'DIV') return false;
      
      // 获取 class 属性
      const classes = ($(el).attr('class') || '').trim();
      
      // 必须同时包含 url-body 和 default 两个 class（使用单词边界匹配，避免误匹配）
      const hasUrlBody = /\burl-body\b/.test(classes);
      const hasDefault = /\bdefault\b/.test(classes);
      
      return hasUrlBody && hasDefault;
    });
    
    // 如果没找到，尝试使用标准选择器
    if ($urlBodies.length === 0) {
      const selector = config.urlBodySelector || 'div.url-body.default';
      $urlBodies = $(selector);
    }
    
    console.log(`找到 ${$urlBodies.length} 个 class="url-body default" 的 div 元素\n`);

    if ($urlBodies.length === 0) {
      console.log('未找到任何 div.url-body.default 元素。');
      console.log('请检查网站结构是否正确。');
      return;
    }

    // 提取所有链接
    const links = [];
    const seenUrls = new Set();
    let processedCount = 0;
    let skippedCount = 0;
    const skipReasons = { noName: 0, noUrl: 0, invalidUrl: 0, javascript: 0, nameTooLong: 0, duplicate: 0 };
    
    // 将 cheerio 对象转换为数组，确保可以正常遍历
    const urlBodiesArray = $urlBodies.toArray();
    
    console.log('正在提取链接信息...\n');
    
    for (let i = 0; i < urlBodiesArray.length; i++) {
      const urlBodyEl = urlBodiesArray[i];
      const $urlBody = $(urlBodyEl);
      
      // 确保是 div 元素
      if (!urlBodyEl) {
        continue;
      }
      
      const tagName = urlBodyEl.tagName || (urlBodyEl.name || '').toUpperCase();
      if (tagName !== 'DIV' && tagName !== 'div') {
        continue;
      }
      
      const linkInfo = extractFromUrlBody($, $urlBody, config, baseUrl);
      
      const { name, url: fullUrl, description } = linkInfo;
      
      if (!name || name.length === 0) {
        skippedCount++;
        skipReasons.noName++;
        continue; // 跳过没有名称的
      }
      
      if (!fullUrl || !fullUrl.startsWith('http')) {
        skippedCount++;
        skipReasons.noUrl++;
        continue; // 跳过无效URL
      }
      
      if (fullUrl.includes('javascript:')) {
        skippedCount++;
        skipReasons.javascript++;
        continue; // 跳过javascript链接
      }
      
      if (name.length >= 200) {
        skippedCount++;
        skipReasons.nameTooLong++;
        continue; // 跳过名称过长的
      }
      
      processedCount++;
      
      // 获取重定向后的最终URL
      let finalUrl = fullUrl;
      if (config.followRedirects && fullUrl) {
        try {
          finalUrl = await getRedirectUrl(fullUrl, config);
          // 如果获取失败，使用原始URL
          if (!finalUrl) {
            finalUrl = fullUrl;
          }
        } catch (error) {
          // 重定向失败，使用原始URL
          finalUrl = fullUrl;
        }
      }
      
      // 去重（基于 URL）
      const normalizedUrl = finalUrl.split('?')[0].split('#')[0].toLowerCase();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        links.push({
          name: name,
          url: finalUrl,
          description: description || ''
        });
      } else {
        // 已存在，跳过
        skipReasons.duplicate++;
      }
      
      // 显示进度
      if ((i + 1) % 50 === 0 || i === urlBodiesArray.length - 1) {
        console.log(`  已处理 ${i + 1}/${urlBodiesArray.length} 个元素...`);
      }
    }
    
    if (skippedCount > 0 || Object.values(skipReasons).some(v => v > 0)) {
      console.log(`\n处理了 ${processedCount} 个，跳过了 ${skippedCount} 个无效链接`);
      if (skipReasons.noName > 0) console.log(`  - 无名称: ${skipReasons.noName}`);
      if (skipReasons.noUrl > 0) console.log(`  - 无URL: ${skipReasons.noUrl}`);
      if (skipReasons.invalidUrl > 0) console.log(`  - 无效URL: ${skipReasons.invalidUrl}`);
      if (skipReasons.javascript > 0) console.log(`  - JavaScript链接: ${skipReasons.javascript}`);
      if (skipReasons.nameTooLong > 0) console.log(`  - 名称过长: ${skipReasons.nameTooLong}`);
      if (skipReasons.duplicate > 0) console.log(`  - 重复: ${skipReasons.duplicate}`);
    }

    // 如果没找到数据
    if (links.length === 0) {
      console.log('\n未找到有效的导航数据。');
      console.log('请检查网站结构是否正确。');
      return;
    }

    // 保存数据
    console.log('\n开始保存数据到文件...\n');
    
    const categoryName = config.outputCategory || '导航数据';
    const data = {
      [categoryName]: links
    };

    const fileName = sanitizeFileName(categoryName) + '.json';
    const filePath = path.join(config.outputDir, fileName);
    
    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`✓ 已保存: ${fileName} (${links.length} 个链接)`);
    console.log(`\n完成！共抓取 ${links.length} 个链接`);
    console.log(`数据保存在: ${config.outputDir}`);

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
    const config = parseArgs();
    
    // 如果请求帮助，已经退出
    if (config.urls.length === 0 && !config.all) {
      console.error('错误: 请指定URL或使用--all选项');
      printHelp();
      process.exit(1);
    }

    await scrapeNavData(config);
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

module.exports = { scrapeNavData, parseArgs };

