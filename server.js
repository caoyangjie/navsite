require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const moment = require('moment');
const { Lunar } = require('lunar-javascript');
const session = require('express-session');
moment.locale('zh-cn');

const app = express();
const PORT = process.env.PORT || 3000;
// 添加上下文路径配置（从环境变量读取，默认为空即根路径）
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, ''); // 移除尾部斜杠

// 配置session（使用内存存储，生产环境建议使用Redis等）
app.use(session({
  secret: process.env.SESSION_SECRET || 'navsite-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 生产环境使用HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 解析JSON请求体
app.use(express.json());

// 静态文件服务
if (BASE_PATH) {
  app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

// 缓存tenant_access_token及其过期时间（正常表格）
let cachedToken = null;
let tokenExpireTime = null;

// 缓存临时表格的tenant_access_token及其过期时间
let cachedTempToken = null;
let tempTokenExpireTime = null;

// 获取tenant_access_token（正常表格）
async function getTenantAccessToken() {
// 检查缓存的token是否存在且未过期（预留5分钟的缓冲时间）
  const now = Date.now();
  if (cachedToken && tokenExpireTime && now < tokenExpireTime - 5 * 60 * 1000) {
    console.log('使用缓存的tenant_access_token');
    return cachedToken;
  }

  try {
    console.log('重新获取tenant_access_token', process.env.APP_ID, process.env.APP_SECRET);
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        app_id: process.env.APP_ID,
        app_secret: process.env.APP_SECRET
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      // 缓存token和过期时间（飞书token有效期为2小时）
      cachedToken = response.data.tenant_access_token;
      // 计算过期时间（当前时间 + token有效期(秒) * 1000）
      tokenExpireTime = now + response.data.expire * 1000;
      return cachedToken;
    } else {
      console.error('获取tenant_access_token失败:', response.data);
      throw new Error(`获取tenant_access_token失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取tenant_access_token异常:', error);
    console.error('获取tenant_access_token异常:', error.message);
    throw error;
  }
}

// 获取临时表格的tenant_access_token
async function getTempTenantAccessToken() {
  // 如果临时表格使用相同的APP_ID和APP_SECRET，则复用正常表格的token
  if (process.env.TEMP_APP_ID === process.env.APP_ID && process.env.TEMP_APP_SECRET === process.env.APP_SECRET) {
    return await getTenantAccessToken();
  }

  // 检查缓存的临时token是否存在且未过期（预留5分钟的缓冲时间）
  const now = Date.now();
  if (cachedTempToken && tempTokenExpireTime && now < tempTokenExpireTime - 5 * 60 * 1000) {
    console.log('使用缓存的临时表格tenant_access_token');
    return cachedTempToken;
  }

  try {
    const tempAppId = process.env.TEMP_APP_ID || process.env.APP_ID;
    const tempAppSecret = process.env.TEMP_APP_SECRET || process.env.APP_SECRET;
    
    console.log('重新获取临时表格tenant_access_token', tempAppId);
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        app_id: tempAppId,
        app_secret: tempAppSecret
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      // 缓存token和过期时间（飞书token有效期为2小时）
      cachedTempToken = response.data.tenant_access_token;
      // 计算过期时间（当前时间 + token有效期(秒) * 1000）
      tempTokenExpireTime = now + response.data.expire * 1000;
      return cachedTempToken;
    } else {
      console.error('获取临时表格tenant_access_token失败:', response.data);
      throw new Error(`获取临时表格tenant_access_token失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取临时表格tenant_access_token异常:', error);
    console.error('获取临时表格tenant_access_token异常:', error.message);
    throw error;
  }
}

// 获取多维表格数据（支持分页，获取所有数据）
async function getBitableData(token, tableId = null, appToken = null) {
  try {
    const targetTableId = tableId || process.env.TABLE_ID || 'tbl3I3RtxgtiC7eF';
    const targetAppToken = appToken || process.env.APP_TOKEN;
    let allItems = [];
    let pageToken = null;
    let hasMore = true;
    
    // 循环获取所有分页数据
    while (hasMore) {
      const params = {
        page_size: 100 // 每页最多100条
      };
      if (pageToken) {
        params.page_token = pageToken;
      }
      
      const response = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${targetAppToken}/tables/${targetTableId}/records`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
          },
          params: params
        }
      );

      if (response.data.code === 0) {
        const items = response.data.data.items || [];
        allItems = allItems.concat(items);
        
        // 检查是否还有更多数据
        hasMore = response.data.data.has_more || false;
        pageToken = response.data.data.page_token || null;
        
        // 如果没有更多数据或没有page_token，退出循环
        if (!hasMore || !pageToken) {
          break;
        }
      } else {
        console.error('获取多维表格数据失败:', response.data);
        throw new Error(`获取多维表格数据失败: ${response.data.msg}`);
      }
    }
    
    console.log(`成功获取 ${allItems.length} 条多维表格数据 (App: ${targetAppToken}, Table: ${targetTableId})`);
    return allItems;
  } catch (error) {
    console.error('获取多维表格数据异常:', error.message);
    throw error;
  }
}

// 获取临时表格数据（支持分页）
async function getTempBitableData(pageToken = null, pageSize = 20) {
  try {
    const token = await getTempTenantAccessToken();
    const tempAppToken = process.env.TEMP_APP_TOKEN || process.env.APP_TOKEN;
    
    const params = {
      page_size: pageSize
    };
    if (pageToken) {
      params.page_token = pageToken;
    }

    const response = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${tempAppToken}/tables/${process.env.TEMP_TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        params: params
      }
    );

    if (response.data.code === 0) {
      return {
        items: response.data.data.items || [],
        hasMore: response.data.data.has_more || false,
        pageToken: response.data.data.page_token || null
      };
    } else {
      console.error('获取临时表格数据失败:', response.data);
      throw new Error(`获取临时表格数据失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取临时表格数据异常:', error.message);
    throw error;
  }
}

// 在临时表格中创建记录
async function createTempBitableRecord(fields) {
  try {
    const token = await getTempTenantAccessToken();
    const tempAppToken = process.env.TEMP_APP_TOKEN || process.env.APP_TOKEN;
    
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${tempAppToken}/tables/${process.env.TEMP_TABLE_ID}/records`,
      { fields },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      console.error('创建临时表格记录失败:', response.data);
      throw new Error(`创建临时表格记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('创建临时表格记录异常:', error.message);
    throw error;
  }
}

// 在正常表格中创建记录
async function createBitableRecord(token, fields, appToken = null, tableId = null) {
  try {
    // 使用传入的参数，如果没有则使用环境变量中的默认值
    const targetAppToken = appToken || process.env.APP_TOKEN;
    const targetTableId = tableId || process.env.TABLE_ID || 'tbl3I3RtxgtiC7eF';
    
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${targetAppToken}/tables/${targetTableId}/records`,
      { fields },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      console.error('创建表格记录失败:', response.data);
      throw new Error(`创建表格记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('创建表格记录异常:', error.message);
    throw error;
  }
}

// 更新正常表格中的记录
async function updateBitableRecord(token, recordId, fields) {
  try {
    const response = await axios.put(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.APP_TOKEN}/tables/${process.env.TABLE_ID}/records/${recordId}`,
      { fields },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      console.error('更新表格记录失败:', response.data);
      throw new Error(`更新表格记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('更新表格记录异常:', error.message);
    throw error;
  }
}

// 删除临时表格记录
async function deleteTempBitableRecord(recordId) {
  try {
    const token = await getTempTenantAccessToken();
    const tempAppToken = process.env.TEMP_APP_TOKEN || process.env.APP_TOKEN;
    
    const response = await axios.delete(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${tempAppToken}/tables/${process.env.TEMP_TABLE_ID}/records/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      console.error('删除临时表格记录失败:', response.data);
      throw new Error(`删除临时表格记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('删除临时表格记录异常:', error.message);
    throw error;
  }
}

// 获取农历日期字符串
function getLunarDateString() {
  const date = new Date();
  const lunar = Lunar.fromDate(date);
  let result = '';
  
  // 处理闰月
  if (lunar.isLeap) {
    result += '闰';
  }
  
  // 月份和日期
  result += lunar.getMonthInChinese() + '月' + lunar.getDayInChinese();
  
  // 获取节气
  const jieQi = lunar.getJieQi();
  if (jieQi) {
    result += ' ' + jieQi;
  }
  
  return result;
}

// 处理多维表格数据
function processTableData(items, tableId = null) {
  const normalizeFieldValue = (value) => {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
      return value
        .map(v => normalizeFieldValue(v))
        .filter(Boolean)
        .join(' ');
    }
    if (typeof value === 'object') {
      if (value.link) {
        return String(value.link).trim();
      }
      if (value.text) {
        return String(value.text).trim();
      }
      if (value.value) {
        return String(value.value).trim();
      }
    }
    return '';
  };

  const pickFieldValue = (fields, candidates) => {
    for (const key of candidates) {
      if (fields[key] !== undefined && fields[key] !== null) {
        const normalized = normalizeFieldValue(fields[key]);
        if (normalized) {
          return normalized;
        }
      }
    }
    return '';
  };

  // 提取记录并按分类分组
  const records = items.map(item => {
    const fields = item.fields || {};
    
    // 获取站点名称
    const name = pickFieldValue(fields, ['name', '站点名称', '网站名称', '名称']);
    
    // 获取网址（处理链接类型和字符串类型）
    const url = pickFieldValue(fields, ['url', '网址', 'URL']);
    
    // 如果站点名称和网址都为空，则跳过该记录
    if (!name.trim() && !url.trim()) {
      return null;
    }

    const category = pickFieldValue(fields, ['category', '分类']) || '其它';
    const sortRaw = fields.sort ?? fields.排序 ?? 0;
    const sort = typeof sortRaw === 'number' ? sortRaw : parseInt(sortRaw, 10) || 0;
    const description = pickFieldValue(fields, ['description', '描述']) || '';
    const fullDescription = pickFieldValue(fields, ['fullDescription', '详细介绍']) || '';
    const icon = pickFieldValue(fields, ['icon', '图标', '备用图标']) || '';
    
    return {
      id: item.record_id, // 添加记录ID
      name,
      url,
      category,
      sort,
      icon,
      description,
      fullDescription,
      tableId: tableId || ''
    };
  }).filter(record => record !== null); // 过滤掉空记录

  // 按分类分组
  const groupedByCategory = {};
  records.forEach(record => {
    if (!groupedByCategory[record.category]) {
      groupedByCategory[record.category] = [];
    }
    groupedByCategory[record.category].push(record);
  });

  // 每个分类内按排序字段排序
  Object.keys(groupedByCategory).forEach(category => {
    groupedByCategory[category].sort((a, b) => a.sort - b.sort);
  });

  return groupedByCategory;
}

function createMockItem(item) {
  const name = item.name || '示例网站';
  const defaultDescription = `${name} 是一个示例导航站点，用于展示数据结构。`;
  const defaultFullDescription = `<p>${name} 是一个示例站点，用于展示详情页面的渲染效果。</p>`;
  
  return {
    ...item,
    description: item.description || defaultDescription,
    fullDescription: item.fullDescription || defaultFullDescription,
    tableId: item.tableId || 'tbl3I3RtxgtiC7eF'
  };
}

// 模拟数据（当无法连接飞书API时使用）
const mockData = {
  'Code': [
    createMockItem({ id: 'mock_001', name: 'GitHub', url: 'https://github.com', category: 'Code', sort: 1, icon: 'bi-github' }),
    createMockItem({ id: 'mock_002', name: 'Stack Overflow', url: 'https://stackoverflow.com', category: 'Code', sort: 2, icon: 'bi-stack-overflow' }),
    createMockItem({ id: 'mock_003', name: 'VSCode', url: 'https://code.visualstudio.com', category: 'Code', sort: 3, icon: 'bi-code-square' }),
    createMockItem({ id: 'mock_004', name: 'CodePen', url: 'https://codepen.io', category: 'Code', sort: 4, icon: 'bi-code-slash' })
  ],
  '设计': [
    createMockItem({ id: 'mock_005', name: 'Figma', url: 'https://figma.com', category: '设计', sort: 1, icon: 'bi-palette' }),
    createMockItem({ id: 'mock_006', name: 'Dribbble', url: 'https://dribbble.com', category: '设计', sort: 2, icon: 'bi-dribbble' }),
    createMockItem({ id: 'mock_007', name: 'Behance', url: 'https://behance.net', category: '设计', sort: 3, icon: 'bi-brush' }),
    createMockItem({ id: 'mock_008', name: 'Unsplash', url: 'https://unsplash.com', category: '设计', sort: 4, icon: 'bi-image' })
  ],
  '产品': [
    createMockItem({ id: 'mock_009', name: 'ProductHunt', url: 'https://producthunt.com', category: '产品', sort: 1, icon: 'bi-graph-up' }),
    createMockItem({ id: 'mock_010', name: 'Trello', url: 'https://trello.com', category: '产品', sort: 2, icon: 'bi-kanban' }),
    createMockItem({ id: 'mock_011', name: 'Notion', url: 'https://notion.so', category: '产品', sort: 3, icon: 'bi-journal-text' }),
    createMockItem({ id: 'mock_012', name: 'Asana', url: 'https://asana.com', category: '产品', sort: 4, icon: 'bi-list-check' })
  ],
  '其它': [
    createMockItem({ id: 'mock_013', name: '百度', url: 'https://baidu.com', category: '其它', sort: 1, icon: 'bi-search' }),
    createMockItem({ id: 'mock_014', name: '微博', url: 'https://weibo.com', category: '其它', sort: 2, icon: 'bi-chat-dots' }),
    createMockItem({ id: 'mock_015', name: '知乎', url: 'https://zhihu.com', category: '其它', sort: 3, icon: 'bi-question-circle' }),
    createMockItem({ id: 'mock_016', name: 'B站', url: 'https://bilibili.com', category: '其它', sort: 4, icon: 'bi-play-btn' })
  ]
};

// API路由 - 获取导航数据
app.get(`${BASE_PATH}/api/navigation`, async (req, res) => {
  try {
    let data;
    let categories;
    let isMockData = false;
    
    // 获取指定的表格ID（从查询参数中获取）
    const tableId = req.query.table_id || null;
    let targetAppToken = process.env.APP_TOKEN;
    let targetTableId = tableId || process.env.TABLE_ID || 'tbl3I3RtxgtiC7eF';
    
    // 如果指定了table_id，需要从MM_TABLE_ID中查找对应的app_token
    if (tableId && tableId !== 'tbl3I3RtxgtiC7eF') {
      if (process.env.MM_TABLE_ID) {
        try {
          const token = await getTenantAccessToken();
          const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
          const mmResponse = await axios.get(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
              },
              params: {
                page_size: 100
              }
            }
          );
          
          if (mmResponse.data.code === 0 && mmResponse.data.data.items) {
            const targetTable = mmResponse.data.data.items.find(item => {
              const fields = item.fields;
              return (fields['tableId'] || fields['表格ID']) === tableId;
            });
            
            if (targetTable) {
              const tableFields = targetTable.fields;
              targetAppToken = tableFields['token'] || tableFields['应用Token'] || process.env.APP_TOKEN;
              targetTableId = tableFields['tableId'] || tableFields['表格ID'] || tableId;
              console.log('从MM_TABLE_ID找到表格，App Token:', targetAppToken, 'Table ID:', targetTableId);
            }
          }
        } catch (mmError) {
          console.warn('查找表格信息失败，使用默认表格:', mmError.message);
          targetTableId = 'tbl3I3RtxgtiC7eF';
        }
      }
    }
    
    // 尝试从飞书API获取数据
    try {
      const token = await getTenantAccessToken();
      const items = await getBitableData(token, targetTableId, targetAppToken);
      data = processTableData(items, targetTableId);
      categories = Object.keys(data);
    } catch (apiError) {
      console.log('无法从飞书API获取数据，使用模拟数据:', apiError.message);
      // 使用模拟数据
      data = mockData;
      categories = Object.keys(mockData);
      isMockData = true;
    }
    
    // 获取中文星期
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const today = new Date();
    const chineseWeekday = weekdays[today.getDay()];
    
    res.json({
      success: true,
      isMockData: isMockData,
      data: data,
      categories: categories,
      timestamp: new Date().toISOString(),
      dateInfo: {
        time: moment().format('HH:mm'),
        date: moment().format('M月D日'),
        weekday: chineseWeekday,
        lunarDate: getLunarDateString()
      }
    });
  } catch (error) {
    console.error('API错误:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Favicon代理端点
app.get(`${BASE_PATH}/api/favicon`, async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: '缺少url参数'
      });
    }
    
    // 验证URL格式
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '无效的URL格式'
      });
    }
    
    // 只允许http和https协议
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        message: '只支持HTTP和HTTPS协议'
      });
    }
    
    // 尝试获取网站的favicon
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&size=32`;
    
    // 代理请求到Google favicon服务
    const response = await axios.get(faviconUrl, {
      responseType: 'arraybuffer',
      timeout: 5000 // 5秒超时
    });
    
    // 设置正确的Content-Type
    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=86400'); // 缓存24小时
    
    // 返回图片数据
    res.send(response.data);
    
  } catch (error) {
    console.error('Favicon代理错误:', error.message);
    
    // 返回一个透明的1x1像素图片作为fallback
    const fallbackImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300'); // 缓存5分钟
    res.send(fallbackImage);
  }
});

// 验证中间件 - 检查用户是否已登录
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    return res.status(401).json({
      success: false,
      message: '需要验证，请先登录',
      requiresAuth: true
    });
  }
}

// 登录API - 验证密码
app.post(`${BASE_PATH}/api/auth/login`, async (req, res) => {
  try {
    const { password } = req.body;
    
    // 从环境变量获取密码，如果没有设置则使用默认密码（仅用于开发）
    const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: '请输入密码'
      });
    }
    
    if (password === correctPassword) {
      // 设置session
      req.session.authenticated = true;
      req.session.loginTime = Date.now();
      
      res.json({
        success: true,
        message: '登录成功'
      });
    } else {
      res.status(401).json({
        success: false,
        message: '密码错误'
      });
    }
  } catch (error) {
    console.error('登录异常:', error.message);
    res.status(500).json({
      success: false,
      message: `登录失败: ${error.message}`
    });
  }
});

// 登出API
app.post(`${BASE_PATH}/api/auth/logout`, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('登出异常:', err);
      return res.status(500).json({
        success: false,
        message: '登出失败'
      });
    }
    res.json({
      success: true,
      message: '已登出'
    });
  });
});

// 检查验证状态API
app.get(`${BASE_PATH}/api/auth/status`, (req, res) => {
  res.json({
    success: true,
    authenticated: !!(req.session && req.session.authenticated)
  });
});

// 主页路由
app.get(`${BASE_PATH}/`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 添加新的网站链接（游客申请存储到临时表格，管理员直接存储到正常表格）
app.post(`${BASE_PATH}/api/links`, async (req, res) => {
  try {
    // 解析请求体
    let requestBody = req.body;
    
    // 检查请求体是否存在
    if (!requestBody) {
      return res.status(400).json({
        success: false,
        message: '请求体不能为空'
      });
    }
    
    // 验证必要的字段
    if (!requestBody.name || !requestBody.name.trim()) {
      return res.status(400).json({
        success: false,
        message: '网站名称不能为空'
      });
    }
    
    if (!requestBody.url || !requestBody.url.trim()) {
      return res.status(400).json({
        success: false,
        message: '网站网址不能为空'
      });
    }
    
    if (!requestBody.category || !requestBody.category.trim()) {
      return res.status(400).json({
        success: false,
        message: '分类不能为空'
      });
    }
    
    // 验证网址格式
    try {
      new URL(requestBody.url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '无效的网址格式，请确保包含http://或https://'
      });
    }
    
    // 验证网站名称长度
    if (requestBody.name.length > 50) {
      return res.status(400).json({
        success: false,
        message: '网站名称长度不能超过50个字符'
      });
    }
    
    // 检查用户是否已登录
    const isAuthenticated = req.session && req.session.authenticated;
    
    // 构建请求体，符合飞书多维表格API的要求
    const fields = {
      '分类': requestBody.category,
      '排序': requestBody.sort || 200, // 默认排序值
      '站点名称': requestBody.name,
      '网址': {
        'link': requestBody.url,
        'text': requestBody.name
      }
    };
    
    let result;
    if (isAuthenticated) {
      // 管理员：从MM_TABLE_ID中选择表格存储，或使用默认表格
      const token = await getTenantAccessToken();
      
      // 获取目标表格ID和App Token
      let targetTableId = requestBody.table_id || 'tbl3I3RtxgtiC7eF'; // 默认表格
      let targetAppToken = process.env.APP_TOKEN;
      
      // 如果指定了table_id，需要从MM_TABLE_ID中查找对应的app_token
      if (requestBody.table_id && requestBody.table_id !== 'tbl3I3RtxgtiC7eF') {
        if (process.env.MM_TABLE_ID) {
          try {
            const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
            const mmResponse = await axios.get(
              `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json; charset=utf-8'
                },
                params: {
                  page_size: 100
                }
              }
            );
            
            if (mmResponse.data.code === 0 && mmResponse.data.data.items) {
              const targetTable = mmResponse.data.data.items.find(item => {
                const fields = item.fields;
                return (fields['tableId'] || fields['表格ID']) === requestBody.table_id;
              });
              
              if (targetTable) {
                const tableFields = targetTable.fields;
                targetAppToken = tableFields['token'] || tableFields['应用Token'] || process.env.APP_TOKEN;
                targetTableId = tableFields['tableId'] || tableFields['表格ID'] || requestBody.table_id;
              }
            }
          } catch (mmError) {
            console.warn('查找表格信息失败，使用默认表格:', mmError.message);
            targetTableId = 'tbl3I3RtxgtiC7eF';
          }
        }
      }
      
      result = await createBitableRecord(token, fields, targetAppToken, targetTableId);
      res.json({
        success: true,
        message: '链接添加成功',
        data: result
      });
    } else {
      // 游客：存储到临时表格
      if (!process.env.TEMP_TABLE_ID) {
        return res.status(500).json({
          success: false,
          message: '临时表格未配置，请联系管理员'
        });
      }
      result = await createTempBitableRecord(fields);
      res.json({
        success: true,
        message: '申请已提交，等待管理员审核',
        data: result
      });
    }
  } catch (error) {
    console.error('添加链接异常:', error.message);
    res.status(500).json({
      success: false,
      message: `添加链接失败: ${error.message}`
    });
  }
});

// 处理临时表格数据
function processTempTableData(items) {
  return items.map(item => {
    const fields = item.fields;
    return {
      id: item.record_id,
      name: fields.name || fields.站点名称 || '',
      url: fields.url || fields.网址?.link || '',
      category: fields.category || fields.分类 || '其它',
      sort: fields.sort || fields.排序 || 0,
      icon: fields?.icon?.link || fields?.备用图标?.link || '',
      createdAt: item.created_time || item.created_at || ''
    };
  }).filter(record => record.name || record.url); // 过滤掉空记录
}

// 获取待审核链接列表（公开接口，游客可查看）
app.get(`${BASE_PATH}/api/pending-links-public`, async (req, res) => {
  try {
    if (!process.env.TEMP_TABLE_ID) {
      return res.status(500).json({
        success: false,
        message: '临时表格未配置'
      });
    }

    const result = await getTempBitableData(null, 100); // 游客最多查看100条
    
    const processedItems = processTempTableData(result.items);

    res.json({
      success: true,
      data: processedItems
    });
  } catch (error) {
    console.error('获取待审核链接异常:', error.message);
    res.status(500).json({
      success: false,
      message: `获取待审核链接失败: ${error.message}`
    });
  }
});

// 获取待审核链接列表（需要验证，支持分页）
app.get(`${BASE_PATH}/api/pending-links`, requireAuth, async (req, res) => {
  try {
    const pageToken = req.query.page_token || null;
    const pageSize = parseInt(req.query.page_size) || 20;

    if (!process.env.TEMP_TABLE_ID) {
      return res.status(500).json({
        success: false,
        message: '临时表格未配置'
      });
    }

    const result = await getTempBitableData(pageToken, pageSize);
    
    const processedItems = processTempTableData(result.items);

    res.json({
      success: true,
      data: processedItems,
      pagination: {
        hasMore: result.hasMore,
        pageToken: result.pageToken
      }
    });
  } catch (error) {
    console.error('获取待审核链接异常:', error.message);
    res.status(500).json({
      success: false,
      message: `获取待审核链接失败: ${error.message}`
    });
  }
});

// 同意申请（同步到正常表格，删除临时表格数据，需要验证）
app.post(`${BASE_PATH}/api/pending-links/:id/approve`, requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        message: '记录ID不能为空'
      });
    }

    if (!process.env.TEMP_TABLE_ID) {
      return res.status(500).json({
        success: false,
        message: '临时表格未配置'
      });
    }

    // 1. 从临时表格获取记录数据
    const tempToken = await getTempTenantAccessToken();
    const tempAppToken = process.env.TEMP_APP_TOKEN || process.env.APP_TOKEN;
    
    const tempResponse = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${tempAppToken}/tables/${process.env.TEMP_TABLE_ID}/records/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${tempToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (tempResponse.data.code !== 0) {
      return res.status(404).json({
        success: false,
        message: '未找到待审核记录'
      });
    }

    const tempFields = tempResponse.data.data.record.fields;
    
    // 2. 构建正常表格的字段
    // 处理字段名称的兼容性（支持中英文字段名）
    const category = tempFields.分类 || tempFields.category || '其它';
    const sort = Number(tempFields.排序 || tempFields.sort || 200);
    const name = tempFields.站点名称 || tempFields.name || '';
    
    // 处理网址字段（可能是链接类型或字符串）
    let urlField;
    if (tempFields.网址) {
      if (typeof tempFields.网址 === 'object' && tempFields.网址.link) {
        // 链接类型
        urlField = {
          'link': tempFields.网址.link,
          'text': name || tempFields.网址.text || ''
        };
      } else if (typeof tempFields.网址 === 'string') {
        // 字符串类型
        urlField = {
          'link': tempFields.网址,
          'text': name
        };
      }
    } else if (tempFields.url) {
      if (typeof tempFields.url === 'object' && tempFields.url.link) {
        urlField = {
          'link': tempFields.url.link,
          'text': name || tempFields.url.text || ''
        };
      } else if (typeof tempFields.url === 'string') {
        urlField = {
          'link': tempFields.url,
          'text': name
        };
      }
    }
    
    if (!urlField || !urlField.link) {
      return res.status(400).json({
        success: false,
        message: '网址字段无效'
      });
    }
    
    const fields = {
      '分类': category,
      '排序': sort,
      '站点名称': name,
      '网址': urlField
    };

    // 3. 创建到正常表格
    const token = await getTenantAccessToken();
    await createBitableRecord(token, fields);

    // 4. 删除临时表格记录
    await deleteTempBitableRecord(recordId);

    res.json({
      success: true,
      message: '申请已同意，链接已添加到导航'
    });
  } catch (error) {
    console.error('同意申请异常:', error.message);
    res.status(500).json({
      success: false,
      message: `同意申请失败: ${error.message}`
    });
  }
});

// 拒绝申请（删除临时表格数据，需要验证）
app.post(`${BASE_PATH}/api/pending-links/:id/reject`, requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        message: '记录ID不能为空'
      });
    }

    if (!process.env.TEMP_TABLE_ID) {
      return res.status(500).json({
        success: false,
        message: '临时表格未配置'
      });
    }

    // 删除临时表格记录
    await deleteTempBitableRecord(recordId);

    res.json({
      success: true,
      message: '申请已拒绝'
    });
  } catch (error) {
    console.error('拒绝申请异常:', error.message);
    res.status(500).json({
      success: false,
      message: `拒绝申请失败: ${error.message}`
    });
  }
});

// 更新网站链接（需要验证）
app.put(`${BASE_PATH}/api/links/:id`, requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    let requestBody = req.body;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        message: '记录ID不能为空'
      });
    }
    
    // 检查请求体是否存在
    if (!requestBody) {
      return res.status(400).json({
        success: false,
        message: '请求体不能为空'
      });
    }
    
    // 验证必要的字段
    if (!requestBody.name || !requestBody.name.trim()) {
      return res.status(400).json({
        success: false,
        message: '网站名称不能为空'
      });
    }
    
    if (!requestBody.url || !requestBody.url.trim()) {
      return res.status(400).json({
        success: false,
        message: '网站网址不能为空'
      });
    }
    
    if (!requestBody.category || !requestBody.category.trim()) {
      return res.status(400).json({
        success: false,
        message: '分类不能为空'
      });
    }
    
    // 验证网址格式
    try {
      new URL(requestBody.url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '无效的网址格式，请确保包含http://或https://'
      });
    }
    
    // 验证网站名称长度
    if (requestBody.name.length > 50) {
      return res.status(400).json({
        success: false,
        message: '网站名称长度不能超过50个字符'
      });
    }
    
    // 获取飞书访问令牌
    const token = await getTenantAccessToken();
    
    // 构建请求体，符合飞书多维表格API的要求
    const fields = {
      '分类': requestBody.category,
      '排序': requestBody.sort || 200,
      '站点名称': requestBody.name,
      '网址': {
        'link': requestBody.url,
        'text': requestBody.name
      }
    };
    
    // 调用飞书多维表格API更新记录
    const result = await updateBitableRecord(token, recordId, fields);
    
    res.json({
      success: true,
      message: '链接更新成功',
      data: result
    });
  } catch (error) {
    console.error('更新链接异常:', error.message);
    res.status(500).json({
      success: false,
      message: `更新链接失败: ${error.message}`
    });
  }
});

// 删除网站链接（需要验证）
app.delete(`${BASE_PATH}/api/links/:id`, requireAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    
    if (!recordId) {
      return res.status(400).json({
        success: false,
        message: '记录ID不能为空'
      });
    }
    
    // 获取飞书访问令牌
    const token = await getTenantAccessToken();
    
    // 调用飞书多维表格API删除记录
    const response = await axios.delete(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.APP_TOKEN}/tables/${process.env.TABLE_ID}/records/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );
    
    // 处理响应
    if (response.data.code === 0) {
      res.json({
        success: true,
        message: '链接删除成功',
        data: response.data.data
      });
    } else {
      console.error('飞书API错误:', response.data);
      res.status(500).json({
        success: false,
        message: `删除链接失败: ${response.data.msg || '未知错误'}`
      });
    }
  } catch (error) {
    console.error('删除链接异常:', error.message);
    res.status(500).json({
      success: false,
      message: `删除链接失败: ${error.message}`
    });
  }
});

// ==================== 多维表格管理API ====================

// 获取可用的多维表格列表（用于添加链接时选择，需要验证）
app.get(`${BASE_PATH}/api/bitables/available`, async (req, res) => {
  try {
    if (!process.env.MM_TABLE_ID) {
      return res.status(500).json({
        success: false,
        message: '多维表格元信息表未配置，请在环境变量中设置MM_TABLE_ID'
      });
    }
    
    const token = await getTenantAccessToken();
    const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
    
    const response = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        params: {
          page_size: 100 // 获取所有可用表格
        }
      }
    );
    
    if (response.data.code === 0) {
      const items = response.data.data.items || [];
      const processedItems = items.map(item => {
        const fields = item.fields;
        return {
          table_id: fields['tableId'] || fields['表格ID'] || '',
          table_name: fields['name'] || fields['表格名称'] || '',
          app_token: fields['token'] || fields['应用Token'] || '',
          sort: fields['sort'] || fields['排序'] || 10
        };
      }).filter(item => item.table_id); // 过滤掉没有table_id的记录
      
      // 按sort排序
      processedItems.sort((a, b) => a.sort - b.sort);
      
      res.json({
        success: true,
        data: processedItems
      });
    } else {
      console.error('获取可用表格列表失败:', response.data);
      res.status(500).json({
        success: false,
        message: `获取可用表格列表失败: ${response.data.msg || '未知错误'}`
      });
    }
  } catch (error) {
    console.error('获取可用表格列表异常:', error.message);
    res.status(500).json({
      success: false,
      message: `获取可用表格列表失败: ${error.message}`
    });
  }
});

// 获取多维表格列表（分页查询，需要验证）
app.get(`${BASE_PATH}/api/bitables`, requireAuth, async (req, res) => {
  try {
    const pageToken = req.query.page_token || null;
    const pageSize = parseInt(req.query.page_size) || 20;
    
    if (!process.env.MM_TABLE_ID) {
      return res.status(500).json({
        success: false,
        message: '多维表格元信息表未配置，请在环境变量中设置MM_TABLE_ID'
      });
    }
    
    const token = await getTenantAccessToken();
    const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
    
    const params = {
      page_size: Math.min(pageSize, 100) // 最多100条
    };
    if (pageToken) {
      params.page_token = pageToken;
    }
    
    const response = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
        params: params
      }
    );
    
    if (response.data.code === 0) {
      const items = response.data.data.items || [];
      const processedItems = items.map(item => {
        const fields = item.fields;
        return {
          record_id: item.record_id,
          table_name: fields['name'] || fields['表格名称'] || '',
          app_token: fields['token'] || fields['应用Token'] || '',
          table_id: fields['tableId'] || fields['表格ID'] || '',
          sort: fields['sort'] || fields['排序'] || 10,
          description: fields['desc'] || fields['描述'] || '',
          created_time: item.created_time,
          last_modified_time: item.last_modified_time
        };
      });
      
      res.json({
        success: true,
        data: {
          items: processedItems,
          has_more: response.data.data.has_more || false,
          page_token: response.data.data.page_token || null,
          total: processedItems.length
        }
      });
    } else {
      console.error('获取多维表格列表失败:', response.data);
      res.status(500).json({
        success: false,
        message: `获取多维表格列表失败: ${response.data.msg || '未知错误'}`
      });
    }
  } catch (error) {
    console.error('获取多维表格列表异常:', error.message);
    res.status(500).json({
      success: false,
      message: `获取多维表格列表失败: ${error.message}`
    });
  }
});

// 创建新的多维表格（需要验证）
app.post(`${BASE_PATH}/api/bitables`, requireAuth, async (req, res) => {
  try {
    const { table_name, description } = req.body;
    
    if (!table_name || !table_name.trim()) {
      return res.status(400).json({
        success: false,
        message: '表格名称不能为空'
      });
    }
    
    if (table_name.length > 100) {
      return res.status(400).json({
        success: false,
        message: '表格名称长度不能超过100个字符'
      });
    }
    
    const token = await getTenantAccessToken();
    
    // 检查folder_token配置
    if (!process.env.FOLDER_TOKEN) {
      return res.status(500).json({
        success: false,
        message: '文件夹Token未配置，请在环境变量中设置FOLDER_TOKEN'
      });
    }
    
    // 1. 调用飞书API创建多维表格应用
    // 使用创建应用的接口：POST https://open.feishu.cn/open-apis/bitable/v1/apps
    console.log('开始创建多维表格应用，表格名称:', table_name);
    console.log('使用Folder Token:', process.env.FOLDER_TOKEN);
    
    let createAppResponse;
    try {
      createAppResponse = await axios.post(
        'https://open.feishu.cn/open-apis/bitable/v1/apps',
        {
          folder_token: process.env.FOLDER_TOKEN,
          name: table_name
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
          }
        }
      );
      
      console.log('创建应用API响应:', JSON.stringify(createAppResponse.data, null, 2));
    } catch (apiError) {
      console.error('创建多维表格应用API调用异常:', apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: `创建多维表格应用API调用失败: ${apiError.response?.data?.msg || apiError.message || '未知错误'}`
      });
    }
    
    if (createAppResponse.data.code !== 0) {
      console.error('创建多维表格应用失败，错误码:', createAppResponse.data.code);
      console.error('错误信息:', createAppResponse.data.msg);
      console.error('完整响应:', JSON.stringify(createAppResponse.data, null, 2));
      return res.status(500).json({
        success: false,
        message: `创建多维表格应用失败: ${createAppResponse.data.msg || '未知错误'} (错误码: ${createAppResponse.data.code})`
      });
    }
    
    // 检查返回数据结构
    if (!createAppResponse.data.data || !createAppResponse.data.data.app) {
      console.error('创建应用返回数据结构异常:', JSON.stringify(createAppResponse.data, null, 2));
      return res.status(500).json({
        success: false,
        message: '创建应用成功，但返回数据结构异常'
      });
    }
    
    const newApp = createAppResponse.data.data.app;
    const newAppToken = newApp.app_token;
    const newAppId = newApp.app_id;
    
    console.log('成功创建多维表格应用，App Token:', newAppToken);
    console.log('App ID:', newAppId);
    
    // 2. 为新创建的多维表格添加协作者权限
    if (process.env.OPEN_ID) {
      try {
        console.log('开始添加协作者权限，Open ID:', process.env.OPEN_ID);
        const permissionResponse = await axios.post(
          `https://open.feishu.cn/open-apis/drive/v1/permissions/${newAppToken}/members?need_notification=false&type=bitable`,
          {
            member_id: process.env.OPEN_ID,
            member_type: 'openid',
            perm: 'edit',
            perm_type: 'container',
            type: 'user'
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8'
            }
          }
        );
        
        if (permissionResponse.data.code === 0) {
          console.log('成功添加协作者权限');
        } else {
          console.warn('添加协作者权限失败:', permissionResponse.data.msg);
          // 不中断流程，继续执行
        }
      } catch (permissionError) {
        console.warn('添加协作者权限异常:', permissionError.response?.data || permissionError.message);
        // 不中断流程，继续执行
      }
    } else {
      console.warn('OPEN_ID未配置，跳过添加协作者权限');
    }
    
    // 3. 获取新创建应用的默认表格ID（新创建的应用会自动创建一个默认表格）
    // 需要先获取应用下的表格列表
    let defaultTableId = null;
    try {
      const tablesResponse = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${newAppToken}/tables`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
          }
        }
      );
      
      if (tablesResponse.data.code === 0 && tablesResponse.data.data && tablesResponse.data.data.items) {
        const tables = tablesResponse.data.data.items;
        if (tables.length > 0) {
          defaultTableId = tables[0].table_id;
          console.log('获取到默认表格ID:', defaultTableId);
        }
      }
    } catch (tableError) {
      console.warn('获取表格列表失败:', tableError.response?.data || tableError.message);
    }
    
    // 4. 为新建的表格添加字段（分类、排序、站点名称、网址）
    if (defaultTableId) {
      console.log('开始为表格添加字段，表格ID:', defaultTableId);
      const fields = [
        {
          field_name: '分类',
          type: 3, // 单选类型
          property: {
            options: []
          }
        },
        {
          field_name: '排序',
          type: 2 // 数字类型
        },
        {
          field_name: '站点名称',
          type: 1 // 单行文本类型
        },
        {
          field_name: '网址',
          type: 15 // 超链接类型
        }
      ];
      
      for (const field of fields) {
        try {
          const fieldResponse = await axios.post(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${newAppToken}/tables/${defaultTableId}/fields`,
            field,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );
          if (fieldResponse.data.code === 0) {
            console.log(`成功创建字段: ${field.field_name}`);
          } else {
            console.warn(`创建字段 ${field.field_name} 失败:`, fieldResponse.data.msg);
          }
        } catch (fieldError) {
          console.warn(`创建字段 ${field.field_name} 异常:`, fieldError.response?.data || fieldError.message);
          // 继续创建其他字段，不中断流程
        }
      }
      console.log('字段创建完成');
    }
    
    // 5. 将表格元信息保存到MM_TABLE_ID中
    // MM_TABLE_ID表格字段：name、token、tableId、sort、desc
    if (!process.env.MM_TABLE_ID) {
      console.warn('多维表格元信息表未配置，无法保存表格信息');
      // 即使保存元信息失败，也返回成功，因为应用已经创建
      return res.json({
        success: true,
        message: '多维表格应用创建成功，但元信息表未配置',
        data: {
          app_token: newAppToken,
          app_id: newAppId,
          table_id: defaultTableId,
          name: table_name,
          description: description || ''
        }
      });
    }
    
    const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
    
    // 获取当前最大排序值，新表格的排序值应该是最大值+10
    let maxSort = 10;
    try {
      const mmListResponse = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8'
          },
          params: {
            page_size: 100
          }
        }
      );
      
      if (mmListResponse.data.code === 0 && mmListResponse.data.data && mmListResponse.data.data.items) {
        const items = mmListResponse.data.data.items;
        items.forEach(item => {
          const sort = item.fields['排序'] || item.fields.sort || 10;
          if (sort > maxSort) {
            maxSort = Number(sort);
          }
        });
      }
    } catch (sortError) {
      console.warn('获取排序值失败，使用默认值:', sortError.message);
    }
    
    const newSort = maxSort + 1;
    
    // 保存到MM_TABLE_ID表格，字段名：name、token、tableId、sort、desc
    const mmFields = {
      'name': table_name,
      'token': newAppToken,
      'tableId': defaultTableId || '',
      'sort': newSort,
      'desc': description || ''
    };
    
    console.log('保存表格元信息到MM_TABLE_ID，字段:', mmFields);
    
    const saveMetaResponse = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
      { fields: mmFields },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );
    
    if (saveMetaResponse.data.code !== 0) {
      console.error('保存表格元信息失败:', saveMetaResponse.data);
      console.warn('应用已创建，但元信息保存失败');
    } else {
      console.log('成功保存表格元信息');
    }
    
    res.json({
      success: true,
      message: '多维表格应用创建成功',
      data: {
        app_token: newAppToken,
        app_id: newAppId,
        table_id: defaultTableId,
        name: table_name,
        description: description || ''
      }
    });
  } catch (error) {
    console.error('创建多维表格异常:', error.message);
    res.status(500).json({
      success: false,
      message: `创建多维表格失败: ${error.message}`
    });
  }
});

// 批量创建记录到多维表格
async function batchCreateBitableRecords(token, records, appToken = null, tableId = null) {
  try {
    const targetAppToken = appToken || process.env.APP_TOKEN;
    const targetTableId = tableId || process.env.TABLE_ID || 'tbl3I3RtxgtiC7eF';
    
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${targetAppToken}/tables/${targetTableId}/records/batch_create`,
      { records },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data;
    } else {
      console.error('批量创建记录失败:', response.data);
      throw new Error(`批量创建记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('批量创建记录异常:', error.message);
    throw error;
  }
}

// 批量导入导航数据API（需要验证）
app.post(`${BASE_PATH}/api/links/batch-import`, requireAuth, async (req, res) => {
  try {
    const { data, table_id } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: '数据不能为空，且必须是数组格式'
      });
    }
    
    // 验证数据格式
    for (const item of data) {
      if (!item.name || !item.name.trim()) {
        return res.status(400).json({
          success: false,
          message: '网站名称不能为空'
        });
      }
      
      if (!item.url || !item.url.trim()) {
        return res.status(400).json({
          success: false,
          message: '网站网址不能为空'
        });
      }
      
      if (!item.category || !item.category.trim()) {
        return res.status(400).json({
          success: false,
          message: '分类不能为空'
        });
      }
      
      // 验证网址格式
      try {
        new URL(item.url);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: `无效的网址格式: ${item.url}，请确保包含http://或https://`
        });
      }
    }
    
    const token = await getTenantAccessToken();
    
    // 获取目标表格ID和App Token
    let targetTableId = table_id || 'tbl3I3RtxgtiC7eF';
    let targetAppToken = process.env.APP_TOKEN;
    
    // 如果指定了table_id，需要从MM_TABLE_ID中查找对应的app_token
    if (table_id && table_id !== 'tbl3I3RtxgtiC7eF') {
      if (process.env.MM_TABLE_ID) {
        try {
          const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
          const mmResponse = await axios.get(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${mmAppToken}/tables/${process.env.MM_TABLE_ID}/records`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
              },
              params: {
                page_size: 100
              }
            }
          );
          
          if (mmResponse.data.code === 0 && mmResponse.data.data.items) {
            const targetTable = mmResponse.data.data.items.find(item => {
              const fields = item.fields;
              return (fields['tableId'] || fields['表格ID']) === table_id;
            });
            
            if (targetTable) {
              const tableFields = targetTable.fields;
              targetAppToken = tableFields['token'] || tableFields['应用Token'] || process.env.APP_TOKEN;
              targetTableId = tableFields['tableId'] || tableFields['表格ID'] || table_id;
            }
          }
        } catch (mmError) {
          console.warn('查找表格信息失败，使用默认表格:', mmError.message);
          targetTableId = 'tbl3I3RtxgtiC7eF';
        }
      }
    }
    
    // 转换为飞书API格式
    const records = data.map((item, index) => ({
      fields: {
        '分类': item.category,
        '排序': item.sort || (index + 1) * 10,
        '站点名称': item.name,
        '网址': {
          'link': item.url,
          'text': item.name
        }
      }
    }));
    
    // 批量创建（每次最多500条，飞书API限制）
    const batchSize = 500;
    let totalImported = 0;
    let totalFailed = 0;
    const errors = [];
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        const result = await batchCreateBitableRecords(token, batch, targetAppToken, targetTableId);
        const createdCount = result.records?.length || 0;
        totalImported += createdCount;
        console.log(`批量导入成功: ${createdCount} 条记录`);
      } catch (error) {
        console.error(`批量导入失败 (批次 ${Math.floor(i / batchSize) + 1}):`, error.message);
        totalFailed += batch.length;
        errors.push({
          batch: Math.floor(i / batchSize) + 1,
          error: error.message
        });
      }
      
      // 避免请求过快，添加延迟
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    res.json({
      success: totalFailed === 0,
      message: `导入完成: 成功 ${totalImported} 条，失败 ${totalFailed} 条`,
      data: {
        imported: totalImported,
        failed: totalFailed,
        total: data.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('批量导入异常:', error.message);
    res.status(500).json({
      success: false,
      message: `批量导入失败: ${error.message}`
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  const baseUrl = BASE_PATH ? `http://localhost:${PORT}${BASE_PATH}` : `http://localhost:${PORT}`;
  console.log(`服务器运行在 ${baseUrl}`);
});