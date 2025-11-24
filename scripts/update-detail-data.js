/**
 * 数据更新脚本
 * 从MM_TABLE_ID多维表格中获取多个表格的token和table_id，
 * 根据每个表格中记录的name字段，通过调用DeepSeek API获取详细信息，
 * 然后更新回对应的多维表格
 * 
 * 使用方法:
 *   node scripts/update-detail-data.js [选项]
 * 
 * 环境变量:
 *   APP_ID - 飞书应用ID
 *   APP_SECRET - 飞书应用密钥
 *   MM_TABLE_ID - 多维表格元信息表ID
 *   MM_APP_TOKEN - 多维表格元信息表所在的应用Token（可选，默认使用APP_TOKEN）
 *   DEEPSEEK_API_KEY - DeepSeek API密钥（可选，根据实际API需求配置）
 *   DEEPSEEK_API_URL - DeepSeek API地址（可选，默认: https://api.deepseek.com/v1/chat/completions）
 *   DEEPSEEK_MODEL - DeepSeek 模型名称（可选，默认: deepseek-chat）
 */

require('dotenv').config();
const axios = require('axios');
const fieldTemplate = require('./templates/detail-fields.json');

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    tableName: null,           // 指定要处理的表格名称
    tableId: null,             // 指定要处理的表格ID
    limit: null,               // 限制处理的记录数量
    skipExisting: false,       // 跳过已有详细信息的记录
    dryRun: false,             // 干运行模式（不实际更新）
    delay: 500                 // 每条记录之间的延迟（毫秒）
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--table-name' || arg === '-n') {
      config.tableName = args[++i];
    } else if (arg === '--table-id' || arg === '-t') {
      config.tableId = args[++i];
    } else if (arg === '--limit' || arg === '-l') {
      config.limit = parseInt(args[++i]) || null;
    } else if (arg === '--skip-existing' || arg === '-s') {
      config.skipExisting = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      config.dryRun = true;
    } else if (arg === '--delay') {
      config.delay = parseInt(args[++i]) || 500;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
数据更新脚本

功能:
  从MM_TABLE_ID多维表格中获取多个表格的token和table_id，
  根据每个表格中记录的name字段，通过调用DeepSeek API获取详细信息，
  然后更新回对应的多维表格

使用方法:
  node scripts/update-detail-data.js [选项]

选项:
  -n, --table-name <name>     指定要处理的表格名称（只处理匹配的表格）
  -t, --table-id <id>         指定要处理的表格ID（只处理匹配的表格）
  -l, --limit <number>        限制每个表格处理的记录数量
  -s, --skip-existing         跳过已有详细信息的记录
  -d, --dry-run               干运行模式（不实际更新，只显示将要更新的内容）
  --delay <ms>                每条记录之间的延迟（毫秒，默认: 500）
  -h, --help                  显示帮助信息

环境变量:
  APP_ID                      飞书应用ID（必需）
  APP_SECRET                  飞书应用密钥（必需）
  MM_TABLE_ID                 多维表格元信息表ID（必需）
  MM_APP_TOKEN                多维表格元信息表所在的应用Token（可选）
  DEEPSEEK_API_KEY            DeepSeek API密钥（可选）
  DEEPSEEK_API_URL            DeepSeek API地址（可选，默认: https://api.deepseek.com/v1/chat/completions）
  DEEPSEEK_MODEL              DeepSeek 模型名称（可选，默认: deepseek-chat）

示例:
  # 处理所有表格
  node scripts/update-detail-data.js

  # 只处理指定名称的表格
  node scripts/update-detail-data.js --table-name "AI工具导航"

  # 只处理指定ID的表格
  node scripts/update-detail-data.js --table-id "tblxxx"

  # 限制每个表格只处理10条记录
  node scripts/update-detail-data.js --limit 10

  # 跳过已有详细信息的记录
  node scripts/update-detail-data.js --skip-existing

  # 干运行模式（不实际更新）
  node scripts/update-detail-data.js --dry-run

  # 组合使用
  node scripts/update-detail-data.js --table-name "AI工具导航" --limit 5 --dry-run

  # 控制请求间隔
  node scripts/update-detail-data.js --delay 1000
`);
}

// 获取tenant_access_token
async function getTenantAccessToken() {
  try {
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
      return response.data.tenant_access_token;
    } else {
      throw new Error(`获取tenant_access_token失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取tenant_access_token异常:', error.message);
    throw error;
  }
}

/**
 * 从MM_TABLE_ID获取所有表格信息
 */
async function getAllTableInfos() {
  try {
    if (!process.env.MM_TABLE_ID) {
      throw new Error('请设置环境变量 MM_TABLE_ID（多维表格元信息表ID）');
    }

    const token = await getTenantAccessToken();
    const mmAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;

    if (!mmAppToken) {
      throw new Error('请设置环境变量 MM_APP_TOKEN 或 APP_TOKEN（多维表格元信息表所在的应用Token）');
    }

    console.log(`\n从元数据表格 ${process.env.MM_TABLE_ID} 获取表格信息...\n`);

    let allItems = [];
    let pageToken = null;
    let hasMore = true;

    while (hasMore) {
      const params = {
        page_size: 100
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
        allItems = allItems.concat(items);

        hasMore = response.data.data.has_more || false;
        pageToken = response.data.data.page_token || null;

        if (!hasMore || !pageToken) {
          break;
        }
      } else {
        throw new Error(`获取元数据表格失败: ${response.data.msg}`);
      }
    }

    // 解析表格信息
    const tableInfos = [];
    for (const item of allItems) {
      const fields = item.fields;
      const tableId = fields['tableId'] || fields['表格ID'] || fields['table_id'] || '';
      const appToken = fields['token'] || fields['应用Token'] || fields['appToken'] || fields['app_token'] || '';
      const tableName = fields['name'] || fields['表格名称'] || fields['table_name'] || '';

      if (tableId && appToken) {
        tableInfos.push({
          tableId,
          appToken,
          tableName,
          recordId: item.record_id
        });
      }
    }

    console.log(`找到 ${tableInfos.length} 个表格:\n`);
    tableInfos.forEach((info, index) => {
      console.log(`  ${index + 1}. ${info.tableName || '未命名表格'}`);
      console.log(`     表格ID: ${info.tableId}`);
      console.log(`     应用Token: ${info.appToken}\n`);
    });

    return tableInfos;
  } catch (error) {
    console.error('获取表格信息失败:', error.message);
    throw error;
  }
}

/**
 * 获取指定表格的所有记录
 */
async function getTableRecords(token, appToken, tableId) {
  try {
    let allItems = [];
    let pageToken = null;
    let hasMore = true;

    while (hasMore) {
      const params = {
        page_size: 100
      };
      if (pageToken) {
        params.page_token = pageToken;
      }

      const response = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
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

        hasMore = response.data.data.has_more || false;
        pageToken = response.data.data.page_token || null;

        if (!hasMore || !pageToken) {
          break;
        }
      } else {
        throw new Error(`获取表格记录失败: ${response.data.msg}`);
      }
    }

    return allItems;
  } catch (error) {
    console.error('获取表格记录异常:', error.message);
    throw error;
  }
}

/**
 * 调用DeepSeek API获取详细信息
 * 
 * @param {string} name - 网站名称
 * @param {string} url - 网站URL（可选）
 * @returns {Promise<Object>} 详细信息对象，格式参考getMockData
 */
async function getDeepSeekDetailInfo(name, url = '') {
  try {
    const deepSeekApiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
    const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
    const deepSeekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!deepSeekApiKey) {
      console.warn(`警告: 未配置DEEPSEEK_API_KEY，使用模拟数据`);
      return getMockDetailInfo(name, url);
    }

    // 构造提示词
    const prompt = `请为网站"${name}"${url ? ` (${url})` : ''}生成详细的介绍信息。请以JSON格式返回，包含以下字段：
{
  "description": "简短描述（100字以内）",
  "fullDescription": "详细介绍（HTML格式，包含标题、段落、列表等，500-1000字）",
  "category": "分类名称（如：工具、设计、开发等）"
}

要求：
1. description 应该是简洁明了的网站功能描述
2. fullDescription 应该包含网站的主要功能、特色、使用方法等信息，使用HTML格式
3. category 应该是合适的分类名称
4. 只返回JSON，不要包含其他文字说明`;

    const response = await axios.post(
      deepSeekApiUrl,
      {
        model: deepSeekModel,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的网站信息分析助手，擅长为网站生成准确、详细的介绍信息。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${deepSeekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60秒超时
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content.trim();
      
      // 尝试解析JSON（可能包含markdown代码块）
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
      
      try {
        const detailData = JSON.parse(jsonContent);
        
        // 构造返回对象
        let icon = '';
        if (url && url.startsWith('http')) {
          try {
            icon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
          } catch (e) {
            icon = '';
          }
        }
        
        const result = {
          id: `deepseek_${Date.now()}`,
          name: name,
          url: url || '',
          description: detailData.description || `${name}是一个优秀的工具网站。`,
          category: detailData.category || '工具',
          fullDescription: detailData.fullDescription || `<h3>${name}详细介绍</h3><p>${detailData.description || `${name}是一个功能强大的网站。`}</p>`,
          icon: icon
        };
        
        return result;
      } catch (parseError) {
        console.warn(`解析DeepSeek API响应失败: ${name}`, parseError.message);
        // 如果解析失败，尝试从文本中提取信息
        return extractInfoFromText(content, name, url);
      }
    } else {
      console.warn(`获取详细信息失败: ${name}`, response.data);
      return getMockDetailInfo(name, url);
    }
  } catch (error) {
    console.warn(`调用DeepSeek API失败: ${name}`, error.message);
    // 如果API调用失败，返回模拟数据
    return getMockDetailInfo(name, url);
  }
}

/**
 * 从文本中提取信息（当JSON解析失败时的后备方案）
 */
function extractInfoFromText(text, name, url = '') {
  // 尝试提取描述
  const descMatch = text.match(/"description"\s*:\s*"([^"]+)"/) || 
                    text.match(/描述[：:]\s*([^\n]+)/) ||
                    text.match(/简介[：:]\s*([^\n]+)/);
  const description = descMatch ? descMatch[1] : `${name}是一个优秀的工具网站，提供丰富的功能和优质的服务。`;
  
  // 尝试提取分类
  const categoryMatch = text.match(/"category"\s*:\s*"([^"]+)"/) ||
                        text.match(/分类[：:]\s*([如^\n]+)/);
  const category = categoryMatch ? categoryMatch[1].trim() : '工具';
  
  // 构造HTML格式的详细介绍
  const fullDescription = `
    <h3>${name}详细介绍</h3>
    <p>${description}</p>
    <h4>主要功能</h4>
    <p>${name}提供丰富的功能和优质的服务，满足用户的各种需求。</p>
    <h4>使用说明</h4>
    <p>使用本网站非常简单，只需要按照提示操作即可。如有问题，欢迎通过反馈功能联系我们。</p>
  `;
  
  return {
    id: `deepseek_${Date.now()}`,
    name: name,
    url: url || '',
    description: description,
    category: category,
    fullDescription: fullDescription,
          icon: (url && url.startsWith('http')) ? (() => {
            try {
              return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
            } catch (e) {
              return '';
            }
          })() : ''
  };
}

/**
 * 生成模拟的详细信息（当API不可用时使用）
 */
function getMockDetailInfo(name, url = '') {
  return {
    id: `mock_${Date.now()}`,
    name: name,
    url: url || `https://www.example.com`,
    description: `${name}是一个优秀的工具网站，提供丰富的功能和优质的服务。`,
    category: '工具',
    fullDescription: `
      <h3>${name}详细介绍</h3>
      <p>${name}是一个功能强大的网站，为用户提供便捷的服务和优质的使用体验。</p>
      <h4>主要功能</h4>
      <ul>
        <li>功能一：提供强大的工具支持</li>
        <li>功能二：简洁易用的界面设计</li>
        <li>功能三：快速响应的服务体验</li>
      </ul>
      <h4>使用说明</h4>
      <p>使用本网站非常简单，只需要按照提示操作即可。如有问题，欢迎通过反馈功能联系我们。</p>
    `,
          icon: (url && url.startsWith('http')) ? (() => {
            try {
              return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
            } catch (e) {
              return '';
            }
          })() : ''
  };
}

/**
 * 获取表格的所有字段
 */
async function getTableFields(token, appToken, tableId) {
  try {
    const response = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );

    if (response.data.code === 0) {
      return response.data.data.items || [];
    } else {
      throw new Error(`获取表格字段失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取表格字段异常:', error.message);
    throw error;
  }
}

/**
 * 创建表格字段
 * @param {string} token - 访问令牌
 * @param {string} appToken - 应用Token
 * @param {string} tableId - 表格ID
 * @param {string} fieldName - 字段名称
 * @param {number} fieldType - 字段类型（1=单行文本，2=多行文本，3=单选，15=超链接）
 * @param {object} property - 字段属性（可选）
 */
async function createTableField(token, appToken, tableId, fieldName, fieldType = 1, property = null) {
  try {
    const fieldData = {
      field_name: fieldName,
      type: fieldType
    };

    if (property) {
      fieldData.property = property;
    }

    const response = await axios.post(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      fieldData,
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
      throw new Error(`创建字段失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error(`创建字段 "${fieldName}" 异常:`, error.message);
    throw error;
  }
}

/**
 * 确保表格中存在所需的字段，如果不存在则创建
 * @param {string} token - 访问令牌
 * @param {string} appToken - 应用Token
 * @param {string} tableId - 表格ID
 * @param {Array<string>} requiredFields - 需要确保存在的字段名称列表
 */
async function ensureTableFields(token, appToken, tableId, requiredFields) {
  try {
    const normalizedFields = requiredFields
      .map(field => {
        if (typeof field === 'string') {
          return { field_name: field, type: 1 };
        }
        const fieldName = field.field_name || field.name || field.title;
        if (!fieldName) {
          return null;
        }
        return {
          field_name: fieldName,
          type: field.type || 1,
          property: field.property || null
        };
      })
      .filter(Boolean);

    // 获取现有字段
    const existingFields = await getTableFields(token, appToken, tableId);
    const existingFieldNames = existingFields.map(field => field.field_name);

    // 检查并创建缺失的字段
    const fieldsToCreate = normalizedFields.filter(field => !existingFieldNames.includes(field.field_name));

    if (fieldsToCreate.length === 0) {
      console.log('  所有字段已存在，无需创建');
      return;
    }

    console.log(`  需要创建 ${fieldsToCreate.length} 个字段: ${fieldsToCreate.map(field => field.field_name).join(', ')}`);

    // 创建缺失的字段
    for (const fieldDef of fieldsToCreate) {
      try {
        await createTableField(
          token,
          appToken,
          tableId,
          fieldDef.field_name,
          fieldDef.type || 1,
          fieldDef.property || null
        );
        console.log(`  ✓ 成功创建字段: ${fieldDef.field_name} (类型: ${fieldDef.type || 1})`);
        
        // 添加延迟，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.warn(`  ✗ 创建字段 "${fieldDef.field_name}" 失败: ${error.message}`);
        // 继续创建其他字段，不中断流程
      }
    }
  } catch (error) {
    console.error('确保字段存在异常:', error.message);
    throw error;
  }
}

/**
 * 更新多维表格记录
 */
async function updateBitableRecord(token, appToken, tableId, recordId, fields) {
  try {
    const response = await axios.put(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
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
      throw new Error(`更新表格记录失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('更新表格记录异常:', error.message);
    throw error;
  }
}

/**
 * 根据字段类型验证和转换数据值
 * @param {any} value - 要设置的值
 * @param {object} field - 字段信息
 * @returns {any} 转换后的值
 */
function convertFieldValue(value, field) {
  if (value === null || value === undefined) {
    return null;
  }

  const fieldType = field.type;
  
  // 根据字段类型进行转换
  switch (fieldType) {
    case 1: // 单行文本
    case 2: // 多行文本
      return String(value);
    
    case 3: // 单选
      // 单选字段需要是字符串，且必须在选项中
      return String(value);
    
    case 4: // 多选
      // 多选字段需要是字符串数组
      if (Array.isArray(value)) {
        return value.map(v => String(v));
      }
      return [String(value)];
    
    case 5: // 日期
      // 日期字段需要是时间戳（毫秒）
      if (typeof value === 'number') {
        return value;
      }
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.getTime();
    
    case 7: // 复选框
      // 复选框需要是布尔值
      return Boolean(value);
    
    case 11: // 数字
      // 数字字段需要是数字类型
      const num = Number(value);
      return isNaN(num) ? null : num;
    
    case 15: // 超链接
      // 超链接字段需要是对象 {link: string, text: string}
      if (typeof value === 'object' && value.link) {
        return value;
      }
      if (typeof value === 'string') {
        return { link: value, text: value };
      }
      return null;
    
    case 17: // 附件
      // 附件字段需要是对象数组
      if (Array.isArray(value)) {
        return value;
      }
      return [];
    
    case 18: // 关联
      // 关联字段需要是字符串数组（记录ID）
      if (Array.isArray(value)) {
        return value.map(v => String(v));
      }
      return [String(value)];
    
    case 19: // 公式
      // 公式字段是只读的，不能更新
      return null;
    
    case 20: // 创建时间
    case 21: // 最后更新时间
      // 时间字段是只读的，不能更新
      return null;
    
    default:
      // 其他类型，尝试转换为字符串
      return String(value);
  }
}

/**
 * 过滤和转换更新字段，确保类型匹配
 * @param {object} updateFields - 要更新的字段
 * @param {Array} tableFields - 表格字段列表
 * @returns {object} 转换后的字段
 */
function filterAndConvertFields(updateFields, tableFields) {
  const fieldMap = {};
  tableFields.forEach(field => {
    fieldMap[field.field_name] = field;
  });

  const convertedFields = {};
  
  for (const [fieldName, value] of Object.entries(updateFields)) {
    const field = fieldMap[fieldName];
    
    if (!field) {
      // 字段不存在，跳过
      console.warn(`    警告: 字段 "${fieldName}" 不存在于表格中，跳过`);
      continue;
    }

    try {
      const convertedValue = convertFieldValue(value, field);
      
      if (convertedValue !== null && convertedValue !== undefined) {
        convertedFields[fieldName] = convertedValue;
      }
    } catch (error) {
      console.warn(`    警告: 字段 "${fieldName}" 值转换失败: ${error.message}，跳过`);
    }
  }

  return convertedFields;
}

/**
 * 保存待更新数据到JSON文件
 */

/**
 * 处理单个表格的数据更新
 */
async function processTable(tableInfo, config = {}) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`处理表格: ${tableInfo.tableName || '未命名表格'}`);
    console.log(`表格ID: ${tableInfo.tableId}`);
    console.log(`${'='.repeat(60)}\n`);

    const token = await getTenantAccessToken();
    
    // 先确保所需的字段存在
    console.log('检查表格字段...');
    const requiredFields = fieldTemplate;
    try {
      await ensureTableFields(token, tableInfo.appToken, tableInfo.tableId, requiredFields);
    } catch (error) {
      console.warn(`  字段检查失败: ${error.message}，继续处理...`);
    }
    console.log('');
    
    // 获取表格所有记录
    console.log('正在获取表格记录...');
    let records = await getTableRecords(token, tableInfo.appToken, tableInfo.tableId);
    console.log(`找到 ${records.length} 条记录\n`);

    if (records.length === 0) {
      console.log('表格为空，跳过处理\n');
      return { updated: 0, failed: 0, skipped: 0 };
    }

    // 如果设置了限制，只处理前N条
    if (config.limit && config.limit > 0) {
      records = records.slice(0, config.limit);
      console.log(`限制处理数量: ${records.length} 条记录\n`);
    }

    let processed = 0;
    let skipped = 0;
    let updated = 0;
    let failed = 0;

    // 获取字段信息用于类型转换
    let tableFields = null;
    try {
      tableFields = await getTableFields(token, tableInfo.appToken, tableInfo.tableId);
    } catch (error) {
      console.warn(`  获取字段信息失败: ${error.message}，将不进行类型转换`);
    }

    // 遍历每条记录
    for (const record of records) {
      processed++;
      const fields = record.fields;
      
      // 获取name字段（支持多种字段名）
      const name = fields['name'] || fields['站点名称'] || fields['网站名称'] || fields['名称'] || '';
      
      if (!name) {
        console.log(`  [${processed}/${records.length}] 跳过: 记录ID ${record.record_id} 没有name字段`);
        skipped++;
        continue;
      }

      // 如果设置了跳过已有详细信息的选项，检查是否已有详细信息
      if (config.skipExisting) {
        const hasDescription = fields['描述'] || fields['description'] || fields['详细介绍'] || fields['fullDescription'];
        if (hasDescription) {
          console.log(`  [${processed}/${records.length}] 跳过: ${name} 已有详细信息`);
          skipped++;
          continue;
        }
      }

      // 获取URL字段（可选）
      const urlField = fields['网址'] || fields['url'] || fields['URL'] || {};
      const url = typeof urlField === 'string' ? urlField : (urlField.link || urlField.text || '');

      console.log(`  [${processed}/${records.length}] 处理: ${name}${url ? ` (${url})` : ''}`);

      try {
        // 调用DeepSeek API获取详细信息
        const detailInfo = await getDeepSeekDetailInfo(name, url);

        // 构建更新字段
        const updateFields = {};

        // 更新描述字段（如果存在）
        if (detailInfo.description) {
          updateFields['描述'] = detailInfo.description;
          updateFields['description'] = detailInfo.description;
        }

        // 更新详细介绍字段（如果存在）
        if (detailInfo.fullDescription) {
          updateFields['详细介绍'] = detailInfo.fullDescription;
          updateFields['fullDescription'] = detailInfo.fullDescription;
        }

        // 更新图标字段（如果存在）
        if (detailInfo.icon) {
          updateFields['图标'] = detailInfo.icon;
          updateFields['icon'] = detailInfo.icon;
        }

        // 更新分类字段（如果存在且原记录没有分类）
        if (detailInfo.category && !fields['分类'] && !fields['category']) {
          updateFields['分类'] = detailInfo.category;
          updateFields['category'] = detailInfo.category;
        }

        if (Object.keys(updateFields).length === 0) {
          console.log(`    - 无需更新`);
          skipped++;
          if (config.delay) {
            await new Promise(resolve => setTimeout(resolve, config.delay));
          }
          continue;
        }

        if (config.dryRun) {
          console.log(`    [干运行] 将更新 ${Object.keys(updateFields).length} 个字段:`, Object.keys(updateFields).join(', '));
          if (config.delay) {
            await new Promise(resolve => setTimeout(resolve, config.delay));
          }
          continue;
        }

        let fieldsToUpdate = updateFields;
        if (tableFields) {
          fieldsToUpdate = filterAndConvertFields(updateFields, tableFields);
        }

        if (!fieldsToUpdate || Object.keys(fieldsToUpdate).length === 0) {
          console.log(`    - 转换后无可更新字段，跳过`);
          skipped++;
          if (config.delay) {
            await new Promise(resolve => setTimeout(resolve, config.delay));
          }
          continue;
        }

        try {
          await updateBitableRecord(
            token,
            tableInfo.appToken,
            tableInfo.tableId,
            record.record_id,
            fieldsToUpdate
          );
          console.log(`    ✓ 更新成功: ${record.record_id}`);
          updated++;
        } catch (error) {
          console.error(`    ✗ 更新失败: ${record.record_id} - ${error.message}`);
          if (error.response) {
            console.error(`      错误详情:`, JSON.stringify(error.response.data, null, 2));
          }
          failed++;
        }

        if (config.delay) {
          await new Promise(resolve => setTimeout(resolve, config.delay));
        }

      } catch (error) {
        console.error(`    ✗ 处理失败: ${error.message}`);
        skipped++;
      }
    }

    console.log(`\n更新完成: 成功 ${updated} 条, 失败 ${failed} 条, 跳过 ${skipped} 条\n`);

    return {
      updated,
      failed,
      skipped
    };

  } catch (error) {
    console.error(`处理表格失败: ${tableInfo.tableName}`, error.message);
    return { updated: 0, failed: 0, skipped: 0, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 解析命令行参数
    const config = parseArgs();

    console.log('='.repeat(60));
    console.log('数据更新脚本启动');
    if (config.dryRun) {
      console.log('[干运行模式] 不会实际更新数据');
    }
    console.log('='.repeat(60));

    // 检查必要的环境变量
    if (!process.env.APP_ID || !process.env.APP_SECRET) {
      throw new Error('请设置环境变量 APP_ID 和 APP_SECRET');
    }

    // 获取所有表格信息
    let tableInfos = await getAllTableInfos();

    if (tableInfos.length === 0) {
      console.log('没有找到任何表格，退出');
      return;
    }

    // 根据命令行参数过滤表格
    if (config.tableName) {
      tableInfos = tableInfos.filter(info => 
        info.tableName && info.tableName.includes(config.tableName)
      );
      console.log(`\n根据表格名称过滤: "${config.tableName}"`);
      console.log(`找到 ${tableInfos.length} 个匹配的表格\n`);
    }

    if (config.tableId) {
      tableInfos = tableInfos.filter(info => info.tableId === config.tableId);
      console.log(`\n根据表格ID过滤: "${config.tableId}"`);
      console.log(`找到 ${tableInfos.length} 个匹配的表格\n`);
    }

    if (tableInfos.length === 0) {
      console.log('没有找到匹配的表格，退出');
      return;
    }

    // 统计信息
    const stats = {
      totalTables: tableInfos.length,
      totalUpdated: 0,
      totalFailed: 0,
      totalSkipped: 0,
      errors: []
    };

    // 处理每个表格
    for (let i = 0; i < tableInfos.length; i++) {
      const tableInfo = tableInfos[i];
      console.log(`\n[${i + 1}/${tableInfos.length}] 开始处理表格...`);

      try {
        const result = await processTable(tableInfo, config);
        stats.totalUpdated += result.updated || 0;
        stats.totalFailed += result.failed || 0;
        stats.totalSkipped += result.skipped || 0;
        
        if (result.error) {
          stats.errors.push({
            table: tableInfo.tableName,
            error: result.error
          });
        }
      } catch (error) {
        console.error(`处理表格失败: ${tableInfo.tableName}`, error.message);
        stats.errors.push({
          table: tableInfo.tableName,
          error: error.message
        });
      }

      // 表格之间添加延迟，避免请求过快
      if (i < tableInfos.length - 1) {
        console.log('\n等待 2 秒后处理下一个表格...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 输出统计信息
    console.log('\n' + '='.repeat(60));
    console.log('更新完成 - 统计信息');
    console.log('='.repeat(60));
    console.log(`处理表格数: ${stats.totalTables}`);
    console.log(`成功更新: ${stats.totalUpdated} 条记录`);
    console.log(`更新失败: ${stats.totalFailed} 条记录`);
    console.log(`跳过记录: ${stats.totalSkipped} 条记录`);
    
    if (stats.errors.length > 0) {
      console.log(`\n错误信息:`);
      stats.errors.forEach(err => {
        console.log(`  - ${err.table}: ${err.error}`);
      });
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n脚本执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

module.exports = {
  getTenantAccessToken,
  getAllTableInfos,
  getTableRecords,
  getDeepSeekDetailInfo,
  getTableFields,
  createTableField,
  ensureTableFields,
  updateBitableRecord,
  processTable
};


