# OpenI 导航数据导入说明

本脚本用于将 https://openi.cn/favorites/5114.html 网站的导航数据导入到飞书多维表格中。

## 使用方法

### 方法一：使用命令行脚本（推荐）

1. 确保已配置环境变量（`.env` 文件）：
   ```
   APP_ID=your_app_id
   APP_SECRET=your_app_secret
   APP_TOKEN=your_app_token
   TABLE_ID=your_table_id  # 可选，默认使用环境变量中的TABLE_ID
   ```

2. 运行导入脚本：
   ```bash
   node scripts/import-openi-data.js
   ```

### 方法二：通过API批量导入

1. 启动服务器：
   ```bash
   npm start
   ```

2. 登录获取认证（需要管理员权限）

3. 调用批量导入API：
   ```bash
   curl -X POST http://localhost:3000/api/links/batch-import \
     -H "Content-Type: application/json" \
     -H "Cookie: connect.sid=your_session_id" \
     -d '{
       "data": [
         {
           "name": "网站名称",
           "url": "https://example.com",
           "category": "分类名称",
           "sort": 10
         }
       ],
       "table_id": "tbl3I3RtxgtiC7eF"
     }'
   ```

## 数据格式

导入的数据需要符合以下格式：

```json
{
  "data": [
    {
      "name": "网站名称",
      "url": "https://example.com",
      "category": "分类名称",
      "sort": 10
    }
  ]
}
```

字段说明：
- `name`: 网站名称（必填）
- `url`: 网站URL（必填，必须包含 http:// 或 https://）
- `category`: 分类名称（必填）
- `sort`: 排序值（可选，数字越小排序越靠前）

## 注意事项

1. 批量导入API需要管理员权限（需要先登录）
2. 每次批量导入最多500条记录（飞书API限制）
3. 脚本会自动分批处理，避免请求过快
4. 导入过程中如果出现错误，会继续处理剩余数据

## 扩展数据

如果需要添加更多导航数据，可以编辑 `scripts/import-openi-data.js` 文件中的 `openiNavigationData` 对象，添加更多分类和网站。

示例：
```javascript
const openiNavigationData = {
  '格式转换': [
    { name: '网站名称', url: 'https://example.com', description: '描述' }
  ],
  '新分类': [
    { name: '网站名称', url: 'https://example.com', description: '描述' }
  ]
};
```

