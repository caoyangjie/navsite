/**
 * 通用导航数据导入脚本
 * 支持将指定目录中的JSON文件导入到指定的飞书多维表格
 * 
 * 使用方法:
 *   node scripts/import-nav-data.js --data-dir ./data --table-id tblxxx --app-token xxx
 *   node scripts/import-nav-data.js --data-dir ./data --table-name "AI导航" --meta-table-id tblxxx
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
 * 从元数据表格中查找表格信息
 */
async function findTableInfo(tableName, metaTableId, metaAppToken) {
  try {
    const token = await getTenantAccessToken();
    
    if (!metaAppToken) {
      metaAppToken = process.env.MM_APP_TOKEN || process.env.APP_TOKEN;
    }
    
    if (!metaAppToken) {
      throw new Error('请设置环境变量 MM_APP_TOKEN 或 APP_TOKEN（元数据表格所在的应用Token）');
    }

    if (!metaTableId) {
      metaTableId = process.env.MM_TABLE_ID;
    }

    if (!metaTableId) {
      throw new Error('请设置环境变量 MM_TABLE_ID（元数据表格ID）');
    }

    console.log(`从元数据表格 ${metaTableId} 中查找 "${tableName}" 表格...\n`);

    // 获取元数据表格的所有记录
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
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${metaAppToken}/tables/${metaTableId}/records`,
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

    // 查找目标表格
    let targetTable = null;

    for (const item of allItems) {
      const fields = item.fields || {};
      
      // 尝试多种可能的字段名
      const itemTableName = fields['表格名称'] || fields['name'] || fields['名称'] || fields['tableName'] || '';
      
      if (itemTableName === tableName) {
        // 获取表格ID和应用Token
        const tableId = fields['表格ID'] || fields['tableId'] || fields['table_id'] || '';
        const appToken = fields['应用Token'] || fields['token'] || fields['appToken'] || fields['app_token'] || '';
        
        if (tableId && appToken) {
          targetTable = {
            tableId: tableId,
            appToken: appToken,
            tableName: itemTableName
          };
          break;
        }
      }
    }

    if (!targetTable) {
      throw new Error(`未找到名为 "${tableName}" 的表格。请检查元数据表格中是否存在该表格的记录。`);
    }

    console.log(`✓ 找到目标表格:`);
    console.log(`  表格名称: ${targetTable.tableName}`);
    console.log(`  表格ID: ${targetTable.tableId}`);
    console.log(`  应用Token: ${targetTable.appToken}\n`);

    return targetTable;
  } catch (error) {
    console.error('查找表格失败:', error.message);
    throw error;
  }
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dataDir: null,
    tableId: null,
    appToken: null,
    tableName: null,
    metaTableId: null,
    metaAppToken: null,
    filePattern: null,
    categoryMapping: null,
    skipExisting: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--data-dir' || arg === '-d') {
      config.dataDir = args[++i];
    } else if (arg === '--table-id' || arg === '-t') {
      config.tableId = args[++i];
    } else if (arg === '--app-token' || arg === '-a') {
      config.appToken = args[++i];
    } else if (arg === '--table-name' || arg === '-n') {
      config.tableName = args[++i];
    } else if (arg === '--meta-table-id') {
      config.metaTableId = args[++i];
    } else if (arg === '--meta-app-token') {
      config.metaAppToken = args[++i];
    } else if (arg === '--file-pattern' || arg === '-p') {
      config.filePattern = args[++i];
    } else if (arg === '--category-mapping' || arg === '-m') {
      const mapping = args[++i];
      try {
        config.categoryMapping = JSON.parse(mapping);
      } catch (e) {
        console.error('错误: 分类映射JSON格式不正确');
        process.exit(1);
      }
    } else if (arg === '--skip-existing') {
      config.skipExisting = true;
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
通用导航数据导入脚本

使用方法:
  node scripts/import-nav-data.js [选项]

选项:
  -d, --data-dir <dir>          JSON数据文件所在目录（必填）
  -t, --table-id <id>           目标表格ID（方式1：直接指定）
  -a, --app-token <token>       目标表格所在的应用Token（方式1：直接指定）
  -n, --table-name <name>       目标表格名称（方式2：通过元数据表格查找）
  --meta-table-id <id>           元数据表格ID（方式2：通过元数据表格查找）
  --meta-app-token <token>       元数据表格所在的应用Token（方式2：通过元数据表格查找）
  -p, --file-pattern <pattern>  文件名过滤模式（正则表达式，如：/AI/i）
  -m, --category-mapping <json>   分类映射JSON（如：'{"旧分类名":"新分类名"}'）
  --skip-existing                跳过已存在的记录（基于URL去重）
  -h, --help                     显示帮助信息

方式1：直接指定表格ID和应用Token
  node scripts/import-nav-data.js \\
    --data-dir ./openi-data \\
    --table-id tbl3I3RtxgtiC7eF \\
    --app-token IQJzbxdNgaDJ4FsMd67cEgofn9g

方式2：通过元数据表格查找
  node scripts/import-nav-data.js \\
    --data-dir ./openi-data \\
    --table-name "AI导航" \\
    --meta-table-id tblxxx \\
    --meta-app-token xxx

过滤文件名：
  node scripts/import-nav-data.js \\
    --data-dir ./openi-data \\
    --table-id tblxxx \\
    --app-token xxx \\
    --file-pattern "/AI/i"

分类映射：
  node scripts/import-nav-data.js \\
    --data-dir ./openi-data \\
    --table-id tblxxx \\
    --app-token xxx \\
    --category-mapping '{"体验入口":"AI大模型","API":"AI大模型"}'

环境变量:
  APP_ID          飞书应用ID
  APP_SECRET      飞书应用密钥
  APP_TOKEN       默认应用Token（如果未指定--app-token或--meta-app-token）
  MM_TABLE_ID     默认元数据表格ID（如果未指定--meta-table-id）
  MM_APP_TOKEN    默认元数据表格应用Token（如果未指定--meta-app-token）
`);
}

/**
 * 读取指定目录下的JSON文件
 */
function loadDataFiles(dataDir, filePattern = null) {
  const allData = {};
  
  if (!fs.existsSync(dataDir)) {
    console.error(`错误: 数据目录不存在: ${dataDir}`);
    return allData;
  }

  // 读取目录下所有 JSON 文件
  const files = fs.readdirSync(dataDir);
  let jsonFiles = files.filter(file => file.endsWith('.json'));

  // 如果指定了文件名过滤模式
  if (filePattern) {
    try {
      const regex = new RegExp(filePattern);
      jsonFiles = jsonFiles.filter(file => regex.test(file));
    } catch (e) {
      console.error(`错误: 文件名过滤模式格式不正确: ${filePattern}`);
      return allData;
    }
  }

  console.log(`找到 ${jsonFiles.length} 个 JSON 文件:\n`);

  for (const file of jsonFiles) {
    const filePath = path.join(dataDir, file);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);
      
      // JSON 文件的格式是 { "分类名": [...] }
      // 使用文件名（去掉 .json 后缀）作为分类名
      const categoryName = file.replace(/\.json$/, '');
      
      // 获取数据（JSON 中可能只有一个键，也可能有多个）
      let items = [];
      if (Array.isArray(jsonData)) {
        items = jsonData;
      } else if (typeof jsonData === 'object') {
        // 如果 JSON 是对象，取第一个键的值
        const firstKey = Object.keys(jsonData)[0];
        if (Array.isArray(jsonData[firstKey])) {
          items = jsonData[firstKey];
        } else {
          // 如果值是对象，转换为数组
          items = Object.values(jsonData);
        }
      }
      
      if (items.length > 0) {
        allData[categoryName] = items;
        console.log(`  ✓ ${file} -> ${categoryName} (${items.length} 条)`);
      } else {
        console.log(`  ⚠ ${file} -> 无数据`);
      }
    } catch (error) {
      console.error(`  ✗ 读取文件失败 ${file}: ${error.message}`);
    }
  }

  return allData;
}

/**
 * 应用分类映射
 */
function applyCategoryMapping(data, categoryMapping) {
  if (!categoryMapping || Object.keys(categoryMapping).length === 0) {
    return data;
  }

  const mappedData = {};
  
  for (const [oldCategory, items] of Object.entries(data)) {
    const newCategory = categoryMapping[oldCategory] || oldCategory;
    
    if (!mappedData[newCategory]) {
      mappedData[newCategory] = [];
    }
    
    mappedData[newCategory].push(...items);
  }

  return mappedData;
}

/**
 * 批量导入数据到飞书多维表格
 */
async function importDataToBitable(data, tableInfo, skipExisting = false) {
  try {
    const token = await getTenantAccessToken();
    const targetTableId = tableInfo.tableId;
    const targetAppToken = tableInfo.appToken;

    console.log(`\n开始导入数据到表格: ${targetTableId}`);
    console.log(`表格名称: ${tableInfo.tableName}`);
    console.log(`应用Token: ${targetAppToken}\n`);

    // 如果需要跳过已存在的记录，先获取现有记录
    let existingUrls = new Set();
    if (skipExisting) {
      console.log('正在获取现有记录...');
      let pageToken = null;
      let hasMore = true;
      
      while (hasMore) {
        const params = { page_size: 100 };
        if (pageToken) {
          params.page_token = pageToken;
        }

        try {
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
            items.forEach(item => {
              const urlField = item.fields['网址'] || item.fields['url'] || {};
              const url = typeof urlField === 'string' ? urlField : (urlField.link || '');
              if (url) {
                const normalizedUrl = url.split('?')[0].split('#')[0].toLowerCase();
                existingUrls.add(normalizedUrl);
              }
            });
            
            hasMore = response.data.data.has_more || false;
            pageToken = response.data.data.page_token || null;
            
            if (!hasMore || !pageToken) {
              break;
            }
          } else {
            console.warn(`获取现有记录失败: ${response.data.msg}`);
            break;
          }
        } catch (error) {
          console.warn(`获取现有记录异常: ${error.message}`);
          break;
        }
      }
      
      console.log(`已获取 ${existingUrls.size} 条现有记录\n`);
    }

    let totalImported = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const errors = [];
    let sortIndex = 1;

    // 遍历所有分类
    for (const [category, items] of Object.entries(data)) {
      console.log(`处理分类: ${category} (${items.length} 条)`);

      // 过滤已存在的记录
      let itemsToImport = items;
      if (skipExisting) {
        itemsToImport = items.filter(item => {
          const normalizedUrl = item.url.split('?')[0].split('#')[0].toLowerCase();
          if (existingUrls.has(normalizedUrl)) {
            totalSkipped++;
            return false;
          }
          return true;
        });
        
        if (itemsToImport.length < items.length) {
          console.log(`  跳过 ${items.length - itemsToImport.length} 条已存在的记录`);
        }
      }

      if (itemsToImport.length === 0) {
        console.log(`  ⚠ 该分类没有需要导入的记录`);
        continue;
      }

      // 批量导入（每次最多500条，飞书API限制）
      const batchSize = 500;
      for (let i = 0; i < itemsToImport.length; i += batchSize) {
        const batch = itemsToImport.slice(i, i + batchSize);
        const records = batch.map((item, index) => ({
          fields: {
            '分类': category,
            '排序': sortIndex + index,
            '站点名称': item.name,
            '网址': {
              'link': item.url,
              'text': item.name
            }
          }
        }));
        sortIndex += batch.length;

        try {
          // 批量创建记录（飞书API支持批量创建）
          const response = await axios.post(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${targetAppToken}/tables/${targetTableId}/records/batch_create`,
            {
              records: records
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );

          if (response.data.code === 0) {
            const createdCount = response.data.data.records?.length || 0;
            totalImported += createdCount;
            console.log(`  ✓ 成功导入 ${createdCount} 条记录`);
          } else {
            console.error(`  ✗ 批量导入失败: ${response.data.msg}`);
            totalFailed += batch.length;
            errors.push({
              category,
              batch: Math.floor(i / batchSize) + 1,
              error: response.data.msg
            });
          }
        } catch (error) {
          console.error(`  ✗ 批量导入异常: ${error.message}`);
          totalFailed += batch.length;
          errors.push({
            category,
            batch: Math.floor(i / batchSize) + 1,
            error: error.message
          });
        }

        // 避免请求过快，添加延迟
        if (i + batchSize < itemsToImport.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    console.log(`\n导入完成:`);
    console.log(`  成功: ${totalImported} 条`);
    console.log(`  失败: ${totalFailed} 条`);
    if (skipExisting) {
      console.log(`  跳过: ${totalSkipped} 条（已存在）`);
    }

    if (errors.length > 0) {
      console.log(`\n错误详情:`);
      errors.forEach(err => {
        console.log(`  - ${err.category} (批次 ${err.batch}): ${err.error}`);
      });
    }

    return {
      success: totalFailed === 0,
      imported: totalImported,
      failed: totalFailed,
      skipped: totalSkipped,
      errors
    };
  } catch (error) {
    console.error('导入数据异常:', error.message);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    const config = parseArgs();

    // 检查必要的环境变量
    if (!process.env.APP_ID || !process.env.APP_SECRET) {
      console.error('错误: 请设置环境变量 APP_ID 和 APP_SECRET');
      process.exit(1);
    }

    // 检查数据目录
    if (!config.dataDir) {
      console.error('错误: 请指定数据目录 (--data-dir)');
      printHelp();
      process.exit(1);
    }

    // 检查表格信息
    let tableInfo = null;
    if (config.tableId && config.appToken) {
      // 方式1：直接指定
      tableInfo = {
        tableId: config.tableId,
        appToken: config.appToken,
        tableName: '指定表格'
      };
    } else if (config.tableName) {
      // 方式2：通过元数据表格查找
      tableInfo = await findTableInfo(
        config.tableName,
        config.metaTableId,
        config.metaAppToken
      );
    } else {
      console.error('错误: 请指定表格信息');
      console.error('  方式1: --table-id 和 --app-token');
      console.error('  方式2: --table-name 和 --meta-table-id');
      printHelp();
      process.exit(1);
    }

    // 加载数据文件
    console.log('开始加载数据文件...\n');
    let data = loadDataFiles(config.dataDir, config.filePattern);

    if (Object.keys(data).length === 0) {
      console.error('\n错误: 未找到数据文件');
      process.exit(1);
    }

    // 应用分类映射
    if (config.categoryMapping) {
      console.log('\n应用分类映射...');
      data = applyCategoryMapping(data, config.categoryMapping);
    }

    console.log(`\n共加载 ${Object.keys(data).length} 个分类的数据\n`);

    // 导入数据
    const result = await importDataToBitable(data, tableInfo, config.skipExisting);

    if (result.success) {
      console.log('\n✓ 所有数据导入成功！');
      process.exit(0);
    } else {
      console.log('\n⚠ 部分数据导入失败，请查看错误详情');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n导入失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { importDataToBitable, loadDataFiles, findTableInfo, applyCategoryMapping };

