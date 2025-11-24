# 数据更新脚本使用说明

## 功能说明

`update-detail-data.js` 脚本用于从 `MM_TABLE_ID` 多维表格中获取多个表格的 token 和 table_id，然后根据每个表格中记录的 `name` 字段，通过调用 DeepSeek API 获取详细信息，最后将获取到的数据更新回对应的多维表格。

## 数据格式

脚本获取的详细信息格式参考 `detail-page.js` 中的 `getMockData` 方法：

```javascript
{
  id: 'mock_001',
  name: '示例网站',
  url: 'https://www.example.com',
  description: '这是一个示例网站的描述信息，展示了网站的主要功能和特点。',
  category: '工具',
  fullDescription: '<h3>网站详细介绍</h3><p>...</p>',
  icon: 'https://www.google.com/s2/favicons?domain=example.com&sz=64'
}
```

## 环境变量配置

在 `.env` 文件中配置以下环境变量：

### 必需的环境变量

- `APP_ID` - 飞书应用ID
- `APP_SECRET` - 飞书应用密钥
- `MM_TABLE_ID` - 多维表格元信息表ID

### 可选的环境变量

- `MM_APP_TOKEN` - 多维表格元信息表所在的应用Token（如果不设置，默认使用 `APP_TOKEN`）
- `APP_TOKEN` - 默认应用Token（如果未设置 `MM_APP_TOKEN`，则使用此值）
- `DEEPSEEK_API_KEY` - DeepSeek API密钥（如果未设置，将使用模拟数据）
- `DEEPSEEK_API_URL` - DeepSeek API地址（默认: `https://api.deepseek.com/v1/chat/completions`）
- `DEEPSEEK_MODEL` - DeepSeek 模型名称（默认: `deepseek-chat`，可选: `deepseek-chat`, `deepseek-coder` 等）

## 使用方法

### 基本使用

```bash
node scripts/update-detail-data.js
```

### 命令行参数

脚本支持以下命令行参数：

- `-n, --table-name <name>` - 指定要处理的表格名称（只处理匹配的表格）
- `-t, --table-id <id>` - 指定要处理的表格ID（只处理匹配的表格）
- `-l, --limit <number>` - 限制每个表格处理的记录数量
- `-s, --skip-existing` - 跳过已有详细信息的记录
- `-d, --dry-run` - 干运行模式（不实际更新，只显示将要更新的内容）
- `--delay <ms>` - 每条记录之间的延迟（毫秒，默认: 500）
- `-h, --help` - 显示帮助信息

### 使用示例

```bash
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

# 干运行模式（不实际更新，用于测试）
node scripts/update-detail-data.js --dry-run

# 组合使用多个参数
node scripts/update-detail-data.js --table-name "AI工具导航" --limit 5 --dry-run

# 查看帮助信息
node scripts/update-detail-data.js --help
```

### 配置 DeepSeek API

1. **如果使用真实的 DeepSeek API**：
   - 在 DeepSeek 平台注册并获取 API Key: https://platform.deepseek.com/
   - 在 `.env` 文件中设置 `DEEPSEEK_API_KEY`
   - 可选：设置 `DEEPSEEK_API_URL`（默认使用官方地址）
   - 可选：设置 `DEEPSEEK_MODEL`（默认: `deepseek-chat`）

2. **如果暂时没有 DeepSeek API Key**：
   - 脚本会自动使用模拟数据（`getMockDetailInfo` 函数）
   - 模拟数据会生成基本的描述和详细介绍

## 工作流程

1. **获取表格列表**：从 `MM_TABLE_ID` 多维表格中读取所有表格的配置信息（token 和 table_id）

2. **检查并创建字段**：
   - 在处理每个表格之前，先检查表格中是否存在所需的字段
   - 如果字段不存在，自动创建以下字段：
     - `描述` / `description` - 单行文本类型
     - `详细介绍` / `fullDescription` - 多行文本类型
     - `图标` / `icon` - 单行文本类型（用于存储图标URL）
     - `分类` / `category` - 单选类型（可选）
   - 如果所有字段已存在，跳过创建步骤

3. **遍历每个表格**：
   - 获取表格中的所有记录
   - 提取每条记录的 `name` 字段（支持多种字段名：`name`、`站点名称`、`网站名称`、`名称`）
   - 提取 `url` 字段（可选，支持：`网址`、`url`、`URL`）

4. **获取详细信息**：
   - 调用 DeepSeek API 获取详细信息（如果配置了 API）
   - 使用 AI 模型生成网站的描述、详细介绍和分类信息
   - 如果 API 不可用，使用模拟数据

5. **更新多维表格**：
   - 每获取到一条记录的详细信息，就立即更新对应的多维表格记录
   - 更新字段包括：
     - `描述` / `description` - 简短描述
     - `详细介绍` / `fullDescription` - 详细介绍（HTML格式）
     - `图标` / `icon` - 图标URL
     - `分类` / `category` - 分类（仅当原记录没有分类时更新）

6. **逐条更新**：
   - 按照“获取一条、更新一条”的方式顺序执行
   - 每条记录成功后立即写回多维表格
   - 失败的记录会打印错误日志，可根据日志重新尝试

## 字段映射

脚本会自动识别以下字段名：

### 输入字段（从多维表格读取）
- `name` / `站点名称` / `网站名称` / `名称` - 网站名称
- `网址` / `url` / `URL` - 网站URL

### 输出字段（更新到多维表格）
脚本会自动检查并创建以下字段（如果不存在）：
- `描述` / `description` - 简短描述（单行文本类型）
- `详细介绍` / `fullDescription` - 详细介绍（多行文本类型）
- `图标` / `icon` - 图标URL（单行文本类型）
- `分类` / `category` - 分类（单选类型，可选）

### 字段自动创建

脚本会在处理数据之前自动检查表格中是否存在所需的字段。如果字段不存在，会自动创建：

- **描述字段**：单行文本类型（类型代码：1）
- **详细介绍字段**：多行文本类型（类型代码：2）
- **图标字段**：单行文本类型（类型代码：1）
- **分类字段**：单选类型（类型代码：3），初始选项为空

这样可以确保即使表格中没有这些字段，脚本也能正常工作。

## 字段模板与字段维护脚本

- 所有需要自动创建的字段定义都集中在 `scripts/templates/detail-fields.json` 中，可根据需要自行调整字段名称、类型或属性。
- 如果更新了模板，可运行 `scripts/update-bitable-fields.js` 来批量为目标多维表格同步字段结构：

```bash
# 使用默认模板为所有表格同步字段
node scripts/update-bitable-fields.js

# 只更新指定表格
node scripts/update-bitable-fields.js --table-id tblxxx

# 使用自定义字段模板
node scripts/update-bitable-fields.js --fields ./custom-fields.json
```

该脚本会读取模板并为缺失的字段自动创建所需的配置，便于在不同环境或新表格中快速对齐字段结构。

## 注意事项

1. **API 限制**：
   - 飞书 API 对请求频率有限制，脚本会在每条记录之间自动添加延迟
   - 如果需要加快速度，可根据情况调小 `--delay` 参数，但需注意不要触发限流

2. **错误处理**：
   - 如果某条记录处理失败，会记录错误但继续处理其他记录
   - 如果某个表格处理失败，会记录错误但继续处理其他表格
   - 最终会输出完整的统计信息和错误列表

3. **性能考虑**：
   - 每条记录处理后会延迟 500ms，避免请求过快
   - 每个表格处理完后会延迟 2 秒

4. **数据安全**：
   - 脚本只会更新指定的字段，不会覆盖其他字段
   - 如果原记录已有分类，不会更新分类字段

5. **失败重试**：
   - 更新失败的记录会输出详细日志
   - 可根据日志筛选记录后再次运行脚本或使用 `--skip-existing` 选项减少重复处理

## DeepSeek API 配置说明

DeepSeek API 使用标准的 Chat Completions 接口格式。脚本会自动构造提示词，要求 AI 返回 JSON 格式的详细信息。

### 获取 API Key

1. 访问 DeepSeek 平台: https://platform.deepseek.com/
2. 注册账号并登录
3. 在控制台中创建 API Key
4. 将 API Key 配置到 `.env` 文件中

### 自定义提示词

如果需要自定义 AI 生成的提示词，可以修改 `getDeepSeekDetailInfo` 函数中的 `prompt` 变量。

### 支持的模型

- `deepseek-chat` - 通用对话模型（默认）
- `deepseek-coder` - 代码专用模型
- 其他 DeepSeek 支持的模型

### API 响应格式

DeepSeek API 返回的格式：
```json
{
  "choices": [{
    "message": {
      "content": "{\"description\": \"...\", \"fullDescription\": \"...\", \"category\": \"...\"}"
    }
  }]
}
```

脚本会自动解析 JSON 内容并提取所需字段。

## 输出示例

```
============================================================
数据更新脚本启动
============================================================

从元数据表格 tblxxx 获取表格信息...

找到 3 个表格:

  1. AI工具导航
     表格ID: tblxxx1
     应用Token: appxxx1

  2. 设计工具导航
     表格ID: tblxxx2
     应用Token: appxxx2

============================================================
处理表格: AI工具导航
表格ID: tblxxx1
============================================================

正在获取表格记录...
找到 50 条记录

  [1/50] 处理: ChatGPT (https://chat.openai.com)
    ✓ 准备更新 3 个字段
  [2/50] 处理: Midjourney (https://midjourney.com)
    ✓ 准备更新 3 个字段
  ...

开始批量更新 45 条记录...
  批量更新成功: 45 条记录

更新完成: 成功 45 条, 失败 0 条

============================================================
更新完成 - 统计信息
============================================================
处理表格数: 3
成功更新: 120 条记录
更新失败: 0 条记录
跳过记录: 5 条记录
============================================================
```

## 故障排除

### 问题：无法获取 tenant_access_token
- 检查 `APP_ID` 和 `APP_SECRET` 是否正确
- 检查网络连接是否正常

### 问题：无法获取表格信息
- 检查 `MM_TABLE_ID` 是否正确
- 检查 `MM_APP_TOKEN` 或 `APP_TOKEN` 是否正确
- 检查应用是否有访问该表格的权限

### 问题：DeepSeek API 调用失败
- 检查 `DEEPSEEK_API_KEY` 是否正确
- 检查网络连接是否正常
- 检查 API 配额是否充足
- 如果 API 不可用，脚本会自动使用模拟数据
- 查看 DeepSeek API 文档: https://docs.deepseek.com/

### 问题：更新失败
- 检查应用是否有更新表格的权限
- 检查字段名是否匹配
- 查看错误日志了解具体原因

## 相关文件

- `scripts/update-detail-data.js` - 主脚本文件
- `scripts/update-bitable-fields.js` - 字段结构同步脚本
- `scripts/templates/detail-fields.json` - 字段模板定义
- `public/js/modules/detail-page.js` - 详情页管理器（参考数据格式）
- `server.js` - 服务器代码（参考 API 调用方式）

