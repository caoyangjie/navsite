/**
 * 脚本: 更新多维表格字段
 * 使用模板JSON定义需要的字段，自动在目标多维表格中创建缺失字段
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  getTenantAccessToken,
  getAllTableInfos,
  ensureTableFields
} = require('./update-detail-data');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    tableName: null,
    tableId: null,
    fieldsPath: path.join(__dirname, 'templates', 'detail-fields.json')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--table-name' || arg === '-n') {
      config.tableName = args[++i];
    } else if (arg === '--table-id' || arg === '-t') {
      config.tableId = args[++i];
    } else if (arg === '--fields' || arg === '-f') {
      config.fieldsPath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

function printHelp() {
  console.log(`
多维表格字段更新脚本

功能:
  根据字段模板JSON，自动为指定的多维表格创建缺失字段

使用方法:
  node scripts/update-bitable-fields.js [选项]

选项:
  -n, --table-name <name>   只处理匹配名称的表格
  -t, --table-id <id>       只处理匹配ID的表格
  -f, --fields <path>       指定字段模板JSON路径（默认: scripts/templates/detail-fields.json）
  -h, --help                显示帮助信息
`);
}

function loadFieldTemplate(templatePath) {
  const absolutePath = path.isAbsolute(templatePath)
    ? templatePath
    : path.join(process.cwd(), templatePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`字段模板文件不存在: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  try {
    const template = JSON.parse(fileContent);
    if (!Array.isArray(template)) {
      throw new Error('字段模板必须是数组');
    }
    return template;
  } catch (error) {
    throw new Error(`解析字段模板失败: ${error.message}`);
  }
}

async function main() {
  try {
    const config = parseArgs();

    console.log('='.repeat(60));
    console.log('多维表格字段更新脚本');
    console.log('='.repeat(60));

    if (!process.env.APP_ID || !process.env.APP_SECRET) {
      throw new Error('请设置环境变量 APP_ID 和 APP_SECRET');
    }

    const template = loadFieldTemplate(config.fieldsPath);
    console.log(`使用字段模板: ${config.fieldsPath}`);
    console.log(`模板字段数: ${template.length}\n`);

    let tableInfos = await getAllTableInfos();

    if (config.tableName) {
      tableInfos = tableInfos.filter(info => info.tableName && info.tableName.includes(config.tableName));
      console.log(`根据表格名称过滤: "${config.tableName}"，匹配 ${tableInfos.length} 个表格`);
    }

    if (config.tableId) {
      tableInfos = tableInfos.filter(info => info.tableId === config.tableId);
      console.log(`根据表格ID过滤: "${config.tableId}"，匹配 ${tableInfos.length} 个表格`);
    }

    if (tableInfos.length === 0) {
      console.log('没有找到需要处理的表格，退出');
      return;
    }

    const tenantToken = await getTenantAccessToken();

    for (let i = 0; i < tableInfos.length; i++) {
      const tableInfo = tableInfos[i];
      console.log(`\n[${i + 1}/${tableInfos.length}] 处理表格: ${tableInfo.tableName || '未命名表格'} (${tableInfo.tableId})`);

      try {
        await ensureTableFields(tenantToken, tableInfo.appToken, tableInfo.tableId, template);
      } catch (error) {
        console.error(`  ✗ 更新字段失败: ${error.message}`);
      }

      if (i < tableInfos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n字段更新完成');
  } catch (error) {
    console.error('脚本执行失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

