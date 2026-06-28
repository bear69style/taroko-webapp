# 太魯閣輿情日報 Web App

## 部署步驟

### 第一步：更新 GAS

1. 打開 GAS 編輯器
2. 把 `WebApp.gs` 的內容全部替換成 `WebApp_API.gs` 的內容
3. **刪除** `程式碼.gs` 裡的 `doGet` 函數（如果有的話）
4. 儲存
5. 「部署」→「新增部署作業」→ 網頁應用程式 → 執行身分：我 → 存取：任何人
6. 複製 exec 網址備用

### 第二步：部署到 Vercel

1. 把 `taroko-webapp` 資料夾上傳到 GitHub（新建一個 repository）
2. 到 [vercel.com](https://vercel.com) 登入（用 GitHub 帳號）
3. 點「New Project」→ 選剛才的 repository → Import
4. 在「Environment Variables」加入：
   - Name: `REACT_APP_GAS_URL`
   - Value: 第一步複製的 GAS exec 網址
5. 點「Deploy」
6. 等待部署完成，複製 Vercel 提供的網址

### 第三步：使用

用平板 Safari 開啟 Vercel 網址即可。

## 注意事項

- GAS 需要開啟 CORS，目前 `doPost` 直接回傳 JSON，瀏覽器可能會有 CORS 問題
- 如果出現 CORS 錯誤，需要在 GAS 的 `doPost` 加上 CORS headers
- 第一次開啟網頁會要求輸入 GAS URL，輸入後會存在 localStorage
