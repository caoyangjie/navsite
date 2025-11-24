/**
 * 导入包含 AI 字样的 JSON 数据到飞书多维表格
 * 从 scripts/openi-data 目录下读取所有包含 "AI" 的 JSON 文件
 * JSON 文件名作为分类名
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

// 从元数据表格中查找名为 "AI导航" 的表格信息
async function findAITableInfo(tableName) {
  try {
    const token = await getTenantAccessToken();
    const metaTableId = process.env.MM_TABLE_ID; // 元数据表格ID
    const metaAppToken = process.env.MM_APP_TOKEN; // 元数据表格所在的应用Token
    
    if (!metaAppToken) {
      throw new Error('请设置环境变量 APP_TOKEN（元数据表格所在的应用Token）');
    }

    console.log(`从元数据表格 ${metaTableId} 中查找 "AI导航" 表格...\n`);

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

    // 查找名为 "AI导航" 的表格
    const targetTableName = tableName;
    let targetTable = null;

    for (const item of allItems) {
      const fields = item.fields || {};
      
      // 尝试多种可能的字段名
      const tableName = fields['表格名称'] || fields['name'] || fields['名称'] || fields['tableName'] || '';
      
      if (tableName === targetTableName) {
        // 获取表格ID和应用Token
        const tableId = fields['表格ID'] || fields['tableId'] || fields['table_id'] || '';
        const appToken = fields['应用Token'] || fields['token'] || fields['appToken'] || fields['app_token'] || '';
        
        if (tableId && appToken) {
          targetTable = {
            tableId: tableId,
            appToken: appToken,
            tableName: tableName
          };
          break;
        }
      }
    }

    if (!targetTable) {
      throw new Error(`未找到名为 "${targetTableName}" 的表格。请检查元数据表格中是否存在该表格的记录。`);
    }

    console.log(`✓ 找到目标表格:`);
    console.log(`  表格名称: ${targetTable.tableName}`);
    console.log(`  表格ID: ${targetTable.tableId}`);
    console.log(`  应用Token: ${targetTable.appToken}\n`);

    return targetTable;
  } catch (error) {
    console.error('查找AI导航表格失败:', error.message);
    throw error;
  }
}

// 读取所有包含 AI 的 JSON 文件
function loadDataFiles() {
  const dataDir = path.join(__dirname, 'openi-data');
  const allData = {};
  
  if (!fs.existsSync(dataDir)) {
    console.error(`错误: 数据目录不存在: ${dataDir}`);
    return allData;
  }

  // 读取目录下所有 JSON 文件
  const files = fs.readdirSync(dataDir);
  const aiFiles = files.filter(file => {
    // 文件名包含 "AI" 或 "Ai"（不区分大小写）
    return file.endsWith('.json') && /ai/i.test(file);
  });

  console.log(`找到 ${aiFiles.length} 个包含 AI 的 JSON 文件:\n`);

  for (const file of aiFiles) {
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

// 批量导入数据到飞书多维表格
async function importDataToBitable(data, tableInfo) {
  try {
    const token = await getTenantAccessToken();
    const targetTableId = tableInfo.tableId;
    const targetAppToken = tableInfo.appToken;

    console.log(`\n开始导入数据到表格: ${targetTableId}`);
    console.log(`表格名称: ${tableInfo.tableName}`);
    console.log(`应用Token: ${targetAppToken}\n`);

    let totalImported = 0;
    let totalFailed = 0;
    const errors = [];
    let sortIndex = 1;

    // 遍历所有分类
    for (const [category, items] of Object.entries(data)) {
      console.log(`处理分类: ${category} (${items.length} 条)`);

      // 批量导入（每次最多500条，飞书API限制）
      const batchSize = 500;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
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
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    console.log(`\n导入完成:`);
    console.log(`  成功: ${totalImported} 条`);
    console.log(`  失败: ${totalFailed} 条`);

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
    console.log('开始导入包含 AI 的导航数据...\n');

    // 检查必要的环境变量
    if (!process.env.APP_ID || !process.env.APP_SECRET) {
      console.error('错误: 请设置环境变量 APP_ID 和 APP_SECRET');
      process.exit(1);
    }

    if (!process.env.APP_TOKEN) {
      console.error('错误: 请设置环境变量 APP_TOKEN（元数据表格所在的应用Token）');
      process.exit(1);
    }

    // 从元数据表格中查找 "AI导航" 表格
    const tableInfo = await findAITableInfo('AI导航');

    // 加载所有包含 AI 的 JSON 文件
    const aiData = loadDataFiles();

    if (Object.keys(aiData).length === 0) {
      console.error('\n错误: 未找到包含 AI 的数据文件');
      process.exit(1);
    }

    console.log(`\n共加载 ${Object.keys(aiData).length} 个分类的数据\n`);

    // 导入数据到 "AI导航" 表格
    const result = await importDataToBitable(aiData, tableInfo);

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

module.exports = { importDataToBitable, loadAIDataFiles: loadDataFiles, findAITableInfo };

