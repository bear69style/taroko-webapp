import { useState, useEffect, useCallback } from "react";

const GAS_URL = process.env.REACT_APP_GAS_URL || "";

async function gasCall(params = {}) {
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
  const res = await fetch(url.toString());
  return res.json();
}

const FLOWS = {
  morning: [
    { label: "撈取今日輿情", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["系統跑 14 條雷達線 + 中央社、自由時報、ETtoday、聯合報、公視直訂 RSS。"] },
    { label: "打底自動過濾", action: "filterNews", btnLabel: "🧹 自動清洗篩選（Step 2-A）", desc: ["系統自動清洗、去重、媒體正名。"] },
    { label: "人工校對（最重要）", action: null, isProofread: true, withOptional: true, withManualAdd: true },
    { label: "確認寄出", action: "send", btnLabel: "🚀 寄出日報（Step 3）", desc: ["按下後先自動掃描品質，通過才寄出。"], withLine: true, warnMsg: "若 LINE 額度用光，寄出後去信箱複製內文，手動貼到 LINE 群組。" },
  ],
  night: [
    { label: "撈取今晚輿情", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["前一晚先預查，先撈一輪當天的新聞。"] },
    { label: "打底自動過濾", action: "filterNews", btnLabel: "🧹 自動清洗篩選（Step 2-A）", desc: ["系統自動清洗篩選。"] },
    { label: "人工校對", action: null, isProofread: true },
    { label: "存入保險箱", action: "saveHeart", btnLabel: "💾 存檔今晚進度（交接保險箱）", desc: ["把今晚心血鎖進保險箱，明早同仁才能一鍵召回。"], warnMsg: "這一步是前一晚預查的重點，忘了存明早就白做了！" },
    { label: "（明早）還原昨晚進度", action: "restoreHeart", btnLabel: "⏪ 還原昨晚進度（清晨接班用）", desc: ["隔天清晨第一步：先點這個召回昨晚進度。"] },
    { label: "（明早）撈取今早新聞", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["還原後，重跑一次撈取今天最新的早報。"] },
    { label: "（明早）融合今早早報", action: "filterAppend", btnLabel: "🔄 融合今早早報（Step 2-B）", desc: ["把今早新撈的早報，與昨晚的心血融合在一起。"], warnMsg: "若忘記先撈早報就按這個，系統會自動攔截。" },
    { label: "（明早）再次人工校對", action: null, isProofread: true, withOptional: true, withManualAdd: true },
    { label: "（明早）確認寄出", action: "send", btnLabel: "🚀 寄出日報（Step 3）", desc: ["最後校對後正式寄出。"], withLine: true, warnMsg: "前一晚預查的稿，寄出前記得進信箱改主旨日期！" },
  ],
};

const C = {
  green: "#1a4733", greenLight: "#d4ece0", greenBorder: "#a8d4bc",
  night: "#2c3e6b", nightLight: "#dde3f5", nightBorder: "#b8c4e0",
  orange: "#d97a28", red: "#c0440a", success: "#2e7d52",
};

export default function App() {
  const [phase, setPhase] = useState("morning");
  const [current, setCurrent] = useState(0);
  const [email, setEmail] = useState("");
  const [emailOptions, setEmailOptions] = useState([]);
  const [running, setRunning] = useState(false);
  const [runLabel, setRunLabel] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "", err: false });
  const [lineOn, setLineOn] = useState(false);
  const [newsRows, setNewsRows] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const [qualityIssues, setQualityIssues] = useState([]);
  const [checkedRows, setCheckedRows] = useState(new Set());
  const [manualUrl, setManualUrl] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [batchPasteMode, setBatchPasteMode] = useState(false); // 批次貼上還原模式
  const [batchUrls, setBatchUrls] = useState([]); // 貼入的網址列表（可調整順序）

  const night = phase === "night";
  const accent = night ? C.night : C.green;
  const flow = FLOWS[phase];

  useEffect(() => {
    if (!GAS_URL) { setLoadingConfig(false); return; }
    gasCall({ action: "config" })
      .then(cfg => {
        if (cfg.ok) {
          setEmailOptions(cfg.emailOptions || []);
          setEmail(cfg.currentEmail || "");
          if (cfg.state) { setPhase(cfg.state.phase || "morning"); setCurrent(cfg.state.current || 0); }
        }
      }).catch(() => {}).finally(() => setLoadingConfig(false));
  }, []);

  const showToast = useCallback((msg, err = false) => {
    setToast({ show: true, msg, err });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 4000);
  }, []);

  const saveState = useCallback((ph, cur) => {
    gasCall({ action: "setState", state: { phase: ph, current: cur } }).catch(() => {});
  }, []);

  const advance = useCallback((i) => {
    const next = Math.min(i + 1, flow.length - 1);
    setCurrent(next); saveState(phase, next);
  }, [flow.length, phase, saveState]);

  const switchPhase = (p) => { setPhase(p); setCurrent(0); saveState(p, 0); setCheckedRows(new Set()); };
  const resetAll = () => { setCurrent(0); saveState(phase, 0); setCheckedRows(new Set()); };

  const loadNews = useCallback(async () => {
    setLoadingNews(true);
    setCheckedRows(new Set());
    try {
      const r = await gasCall({ action: "getNews" });
      if (r.ok) setNewsRows(r.rows || []);
      else showToast("❌ 載入失敗：" + r.error, true);
    } catch(e) { showToast("❌ 連線失敗", true); }
    finally { setLoadingNews(false); }
  }, [showToast]);

  useEffect(() => {
    const step = flow[current];
    if (step && step.isProofread) loadNews();
  }, [current, phase]);

  const runAction = async (label, action, stepIdx) => {
    if (running) return;
    setRunning(true); setRunLabel(label);
    try {
      const params = { action };
      if (action === "send") params.sendLine = lineOn;
      const result = await gasCall(params);
      if (result.ok) {
        showToast("✅ " + label + " 完成");
        if (stepIdx >= 0) advance(stepIdx);
      } else if (result.issues && result.issues.length > 0) {
        setQualityIssues(result.issues);
        showToast("⚠️ 發現 " + result.issues.length + " 個品質問題，請修正後再寄出", true);
        const proofStep = flow.findIndex(s => s.isProofread);
        if (proofStep >= 0) { setCurrent(proofStep); saveState(phase, proofStep); loadNews(); }
      } else {
        showToast("❌ " + (result.error || result.message || "執行失敗"), true);
      }
    } catch(e) { showToast("❌ 連線失敗：" + e.message, true); }
    finally { setRunning(false); }
  };

  // 刪除單列
  const deleteRow = async (rowNum, title) => {
    if (!window.confirm("確定刪除？\n「" + title.substring(0, 30) + "」")) return;
    try {
      const r = await gasCall({ action: "deleteRow", row: rowNum });
      if (r.ok) { showToast("✅ 已刪除"); loadNews(); }
      else showToast("❌ " + r.error, true);
    } catch(e) { showToast("❌ 連線失敗", true); }
  };

  // 批次刪除勾選的列
  const deleteChecked = async () => {
    if (checkedRows.size === 0) return;
    if (!window.confirm("確定刪除選取的 " + checkedRows.size + " 則新聞？")) return;
    setRunning(true); setRunLabel("批次刪除");
    try {
      // 從大列號開始刪，避免列號位移
      const sorted = Array.from(checkedRows).sort((a, b) => b - a);
      for (const rowNum of sorted) {
        await gasCall({ action: "deleteRow", row: rowNum });
      }
      showToast("✅ 已刪除 " + checkedRows.size + " 則");
      loadNews();
    } catch(e) { showToast("❌ 連線失敗", true); }
    finally { setRunning(false); }
  };

  // 開啟勾選的網址
  const openChecked = () => {
    const urls = newsRows.filter(r => checkedRows.has(r.rowNum)).map(r => r.url).filter(u => u);
    if (!urls.length) { showToast("⚠️ 沒有選取任何新聞", true); return; }
    showToast("🌐 開啟 " + urls.length + " 個網址");
    urls.forEach((url, idx) => setTimeout(() => window.open(url, "_blank"), idx * 400));
  };

  // 開啟全部網址
  const openAllUrls = () => {
    const urls = newsRows.map(r => r.url).filter(u => u);
    if (!urls.length) { showToast("⚠️ 精選表是空的", true); return; }
    showToast("🌐 開啟 " + urls.length + " 個網址，請允許彈出視窗");
    urls.forEach((url, idx) => setTimeout(() => window.open(url, "_blank"), idx * 400));
  };

  // 批次貼上網址處理
  const handleBatchPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const urls = text.split(/[\n\r]+/).map(u => u.trim()).filter(u => /^https?:\/\//.test(u));
    if (!urls.length) { showToast("⚠️ 沒有偵測到網址", true); return; }
    setBatchUrls(urls);
    setBatchPasteMode(true);
    showToast("✅ 讀取到 " + urls.length + " 個網址，請確認順序後套用");
  };

  const applyBatchUrls = async () => {
    // 取出所有有 Google 轉址的新聞，依序對應 batchUrls
    const googleRows = newsRows.filter(r => r.url.includes("news.google.com"));
    if (batchUrls.length === 0) { showToast("⚠️ 沒有網址可套用", true); return; }
    setRunning(true); setRunLabel("批次套用網址");
    try {
      const count = Math.min(googleRows.length, batchUrls.length);
      for (let i = 0; i < count; i++) {
        await gasCall({ action: "updateRow", row: googleRows[i].rowNum, field: "url", value: batchUrls[i] });
      }
      showToast("✅ 已套用 " + count + " 個網址到精選表");
      setBatchPasteMode(false);
      setBatchUrls([]);
      loadNews();
    } catch(e) { showToast("❌ 連線失敗", true); }
    finally { setRunning(false); }
  };

  const moveBatchUrl = (idx, dir) => {
    setBatchUrls(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const removeBatchUrl = (idx) => {
    setBatchUrls(prev => prev.filter((_, i) => i !== idx));
  };

  // 勾選/取消
  const toggleCheck = (rowNum) => {
    setCheckedRows(prev => {
      const next = new Set(prev);
      next.has(rowNum) ? next.delete(rowNum) : next.add(rowNum);
      return next;
    });
  };
  const toggleAll = () => {
    if (checkedRows.size === newsRows.length) setCheckedRows(new Set());
    else setCheckedRows(new Set(newsRows.map(r => r.rowNum)));
  };

  // 儲存編輯
  const saveEdit = async () => {
    if (!editCell) return;
    try {
      const r = await gasCall({ action: "updateRow", row: editCell.rowNum, field: editCell.field, value: editCell.value });
      if (r.ok) {
        showToast("✅ 已儲存");
        setNewsRows(rows => rows.map(row => {
          if (row.rowNum !== editCell.rowNum) return row;
          const fieldMap = { source: "source", title: "title", url: "url" };
          return { ...row, [fieldMap[editCell.field]]: editCell.value };
        }));
        setEditCell(null);
      } else showToast("❌ 儲存失敗", true);
    } catch(e) { showToast("❌ 連線失敗", true); }
  };

  // 直接在單列貼上網址
  const pasteUrlToRow = async (rowNum, url) => {
    url = url.trim();
    if (!url.startsWith("http")) { showToast("⚠️ 請輸入 http 開頭的網址", true); return; }
    try {
      const r = await gasCall({ action: "updateRow", row: rowNum, field: "url", value: url });
      if (r.ok) {
        showToast("✅ 網址已更新");
        setNewsRows(rows => rows.map(row => row.rowNum === rowNum ? { ...row, url } : row));
      } else showToast("❌ 更新失敗", true);
    } catch(e) { showToast("❌ 連線失敗", true); }
  };

  // 手動新增網址：寫入分頁後直接呼叫 importManual，一鍵完成
  const addManualUrl = async () => {
    const url = manualUrl.trim();
    if (!url.startsWith("http")) { showToast("⚠️ 請輸入 http 開頭的網址", true); return; }
    setRunning(true); setRunLabel("加入並抓取");
    try {
      // Step1：寫入「手動加入網址」分頁
      const r1 = await gasCall({ action: "addManualUrl", url });
      if (!r1.ok) { showToast("❌ 寫入失敗：" + (r1.error || ""), true); return; }
      // Step2：直接呼叫 importManual 抓取標題
      const r2 = await gasCall({ action: "importManual" });
      if (r2.ok) {
        setManualUrl("");
        showToast("✅ 已加入並抓取完成，重新載入精選表");
        loadNews();
      } else {
        showToast("❌ 抓取失敗：" + (r2.error || ""), true);
      }
    } catch(e) { showToast("❌ 連線失敗：" + e.message, true); }
    finally { setRunning(false); }
  };

  const onEmailChange = async (val) => {
    setEmail(val);
    if (val) gasCall({ action: "setEmail", email: val }).catch(() => {});
  };

  const btnStyle = (ghost, green, disabled) => ({
    width: "100%", padding: 12, borderRadius: 8,
    border: ghost ? `1.5px solid ${accent}` : "none",
    background: disabled ? "#8a8a82" : green ? C.success : ghost ? "#fff" : accent,
    color: (ghost && !disabled) ? accent : "#fff",
    fontSize: 16, fontWeight: 700, cursor: disabled ? "wait" : "pointer",
    marginTop: 8, fontFamily: "inherit", minHeight: 48,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    opacity: disabled ? 0.8 : 1,
  });

  if (loadingConfig) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: '"Microsoft JhengHei",sans-serif' }}>
      <div style={{ width: 40, height: 40, border: `4px solid #d8d8d0`, borderTopColor: C.green, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      <div style={{ fontSize: 16, color: C.green, fontWeight: 700 }}>載入中…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const F = { fontFamily: '"Microsoft JhengHei","PingFang TC",sans-serif' };

  return (
    <div style={{ ...F, maxWidth: 480, margin: "0 auto", padding: "14px 12px 40px", background: "#fafaf8", minHeight: "100vh", fontSize: 17 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>

      {running && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(250,250,248,.9)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: "4px solid #d8d8d0", borderTopColor: accent, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
          <div style={{ fontSize: 17, fontWeight: 700, color: accent }}>正在執行：{runLabel}…</div>
          <div style={{ fontSize: 15, color: "#8a8a82" }}>請勿關閉或重複點擊</div>
        </div>
      )}

      {toast.show && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.err ? C.red : C.success, color: "#fff", padding: "12px 22px", borderRadius: 10, fontSize: 15, fontWeight: 700, zIndex: 1000, maxWidth: "90vw", textAlign: "center" }}>
          {toast.msg}
        </div>
      )}

      {editCell && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 440 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 16 }}>
              編輯{editCell.field === "source" ? "媒體名稱" : editCell.field === "title" ? "標題" : "網址"}
            </div>
            {editCell.field === "url" ? (
              <textarea value={editCell.value} onChange={e => setEditCell(c => ({ ...c, value: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1.5px solid #ccc", fontSize: 14, fontFamily: "inherit", minHeight: 80, resize: "vertical" }} />
            ) : (
              <input value={editCell.value} onChange={e => setEditCell(c => ({ ...c, value: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1.5px solid #ccc", fontSize: 16, fontFamily: "inherit" }} autoFocus />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditCell(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1.5px solid #ccc", background: "#fff", fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: accent, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: `2px solid ${C.green}`, paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.green }}>📰 輿情日報操作導引</div>
        <div style={{ fontSize: 15, color: "#8a8a82", marginTop: 3 }}>跟著亮起的步驟做，不會漏</div>
      </div>

      {/* 信箱 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "9px 11px", borderRadius: 7, marginBottom: 14, border: `1.5px solid ${email ? "#cfe3d6" : "#f0c0a0"}`, background: email ? "#eef6f0" : "#fff4ec" }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: email ? "#5a7a64" : "#c0440a" }}>📬 本次日報寄給</span>
        <select value={email} onChange={e => onEmailChange(e.target.value)}
          style={{ width: "100%", padding: "8px 9px", borderRadius: 5, border: "1.5px solid #b8d4c2", background: "#fff", fontSize: 16.5, fontWeight: 700, color: C.green, fontFamily: "inherit", margin: "4px 0 2px" }}>
          <option value="">— 請選擇你是誰 —</option>
          {emailOptions.map(o => <option key={o.email} value={o.email}>{o.name}</option>)}
        </select>
        <span style={{ fontSize: 14, color: email ? "#8a8a82" : "#c0440a", fontWeight: email ? 400 : 700 }}>
          {email ? "換人輪值時，直接在上面選自己的名字即可" : "請先選擇你的名字，否則 Email 寄不出去"}
        </span>
      </div>

      {/* 分頁按鈕 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[["morning","☀️ 當天早上查",false],["night","🌙 前一晚預查",true]].map(([p,label,isNight]) => (
          <button key={p} onClick={() => switchPhase(p)}
            style={{ flex: 1, padding: "11px 6px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `2px solid ${phase===p?(isNight?C.night:C.green):(isNight?C.nightBorder:C.greenBorder)}`, background: phase===p?(isNight?C.night:C.green):(isNight?C.nightLight:C.greenLight), color: phase===p?"#fff":(isNight?C.night:C.green), textAlign: "center", minHeight: 44 }}>
            {label}
          </button>
        ))}
      </div>

      {/* 說明條 */}
      <div style={{ borderLeft: `3px solid ${accent}`, padding: "8px 10px", borderRadius: 4, fontSize: 15, color: night?C.night:"#3a5a48", marginBottom: 16, lineHeight: 1.5, background: night?"#eef0f8":"#f0f4f1" }}>
        {phase==="morning" ? "當天早上輪值：撈取 → 打底 → 校對 → 直接寄出，共 4 步。" : "前一晚預查：撈取 → 打底 → 校對 → 存保險箱。明早再還原 → 撈早報 → 補收融合 → 再次校對 → 寄出。"}
      </div>

      {/* 步驟 */}
      {flow.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={i} style={{ border: `1.5px solid ${isActive?(night?"#4a6fa5":C.orange):"#e0e0d8"}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
            <div onClick={() => setCurrent(i)} style={{ display: "flex", alignItems: "center", padding: "12px 11px", cursor: "pointer", gap: 9, minHeight: 50 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: isDone?C.success:isActive?(night?"#4a6fa5":C.orange):"#f0f0e8", color: isDone||isActive?"#fff":"#8a8a82", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: isActive?`0 0 0 3px ${night?"#d0dff5":"#f7e2cf"}`:"none" }}>
                {isDone?"✓":i+1}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16.5, flex: 1, color: isActive?(night?C.night:C.orange):"#2a2a28" }}>
                {step.label}
                {qualityIssues.length > 0 && step.isProofread && isActive && (
                  <span style={{ fontSize: 13, color: C.red, marginLeft: 8 }}>⚠️ {qualityIssues.length} 個問題</span>
                )}
              </div>
              <div style={{ color: "#b0b0a8", fontSize: 15 }}>{isActive?"▾":"▸"}</div>
            </div>

            {isActive && (
              <div style={{ padding: "0 12px 14px 51px" }}>
                {/* 一般說明 */}
                {step.desc && (
                  <ul style={{ listStyle: "none", margin: "4px 0 10px" }}>
                    {step.desc.map((d, j) => (
                      <li key={j} style={{ position: "relative", paddingLeft: 16, marginBottom: 6, fontSize: 15.5, color: "#4a4a44", lineHeight: 1.5 }}>
                        <span style={{ position: "absolute", left: 4, color: night?"#4a6fa5":C.orange, fontWeight: 700 }}>·</span>{d}
                      </li>
                    ))}
                  </ul>
                )}

                {step.warnMsg && <div style={{ background: "#fff6ed", border: "1px solid #f0d2b0", borderRadius: 5, padding: "8px 10px", fontSize: 15, color: "#a85816", margin: "8px 0", lineHeight: 1.5 }}><b>⚠️</b> {step.warnMsg}</div>}

                {/* 品質問題 */}
                {qualityIssues.length > 0 && step.isProofread && (
                  <div style={{ background: "#fff5f5", border: "1px solid #feb2b2", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: C.red, marginBottom: 6, fontSize: 15 }}>🛑 以下 {qualityIssues.length} 則需要修正才能寄出：</div>
                    {qualityIssues.map((issue, j) => (
                      <div key={j} style={{ fontSize: 14, color: "#c0440a", marginBottom: 4, paddingLeft: 8 }}>
                        • 第{issue.row}列「{issue.title.substring(0,20)}{issue.title.length>20?"…":""}」→ {issue.type}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 人工校對區 ── */}
                {step.isProofread && (
                  <div>
                    {/* 工具列 */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <button onClick={() => loadNews()} style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${accent}`, background: "#fff", color: accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔄 重新載入</button>
                      <button onClick={openAllUrls} style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${accent}`, background: "#fff", color: accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🌐 開啟全部</button>
                      <button onClick={() => { setBatchPasteMode(m => !m); setBatchUrls([]); }}
                        style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${batchPasteMode?"#c0440a":accent}`, background: batchPasteMode?"#fff0f0":"#fff", color: batchPasteMode?"#c0440a":accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {batchPasteMode ? "✕ 取消" : "📋 批次貼上還原"}
                      </button>
                    </div>

                    {/* 批次貼上還原浮層 */}
                    {batchPasteMode && (
                      <div style={{ background: "#fffbeb", border: "1.5px solid #f6d860", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#a05000", marginBottom: 6 }}>📋 批次貼上還原 Google 轉址</div>
                        <div style={{ fontSize: 13, color: "#7a6000", lineHeight: 1.6, marginBottom: 10 }}>
                          步驟：<b>1.</b> 點「🌐 開啟全部」讓 Safari 開啟所有分頁 → <b>2.</b> 長按 Safari 側邊欄分頁數量 → <b>3.</b> 點「複製所有連結」→ <b>4.</b> 在下方貼上
                        </div>
                        {batchUrls.length === 0 ? (
                          <div
                            onClick={() => document.getElementById("batchPasteInput").focus()}
                            style={{ border: "1.5px dashed #c8a000", borderRadius: 8, padding: "16px", textAlign: "center", cursor: "pointer", background: "#fffdf0", position: "relative" }}>
                            <div style={{ fontSize: 14, color: "#a05000", fontWeight: 700 }}>👆 點此貼上複製的網址</div>
                            <div style={{ fontSize: 12, color: "#8a7a00", marginTop: 4 }}>可同時貼多個，每行一個</div>
                            <textarea id="batchPasteInput" onPaste={handleBatchPaste}
                              style={{ position: "absolute", opacity: 0, width: 1, height: 1, top: 0, left: 0 }} />
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 13, color: "#5a5a54", marginBottom: 8 }}>
                              共 {batchUrls.length} 個網址，將依序對應精選表中的 Google 轉址。<br/>
                              可調整順序或刪除不需要的網址：
                            </div>
                            {/* 對照表：左邊新聞標題，右邊即將套用的網址 */}
                            {(() => {
                              const googleRows = newsRows.filter(r => r.url.includes("news.google.com"));
                              return batchUrls.map((url, idx) => {
                                const matchRow = googleRows[idx];
                                return (
                                  <div key={idx} style={{ marginBottom: 8, background: "#fff", border: "1px solid #e0e0d0", borderRadius: 8, overflow: "hidden" }}>
                                    {/* 標題列 */}
                                    {matchRow && (
                                      <div style={{ padding: "6px 10px", background: "#f8f8f4", borderBottom: "1px solid #e8e8e0", fontSize: 13, color: "#2a2a28", lineHeight: 1.4 }}>
                                        <span style={{ fontSize: 11, color: "#8a8a82", marginRight: 6 }}>對應新聞：</span>
                                        <b>{matchRow.title.substring(0,35)}{matchRow.title.length>35?"…":""}</b>
                                      </div>
                                    )}
                                    {!matchRow && (
                                      <div style={{ padding: "6px 10px", background: "#fff0f0", borderBottom: "1px solid #f0c0c0", fontSize: 12, color: "#c0440a" }}>
                                        ⚠️ 超出 Google 轉址數量，此網址不會被套用
                                      </div>
                                    )}
                                    {/* 網址 + 操作 */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                                        <button onClick={() => moveBatchUrl(idx, -1)} disabled={idx===0}
                                          style={{ width: 24, height: 20, border: "1px solid #ccc", borderRadius: 3, background: "#fff", cursor: idx===0?"default":"pointer", fontSize: 11, color: idx===0?"#ccc":"#555", lineHeight: 1 }}>▲</button>
                                        <button onClick={() => moveBatchUrl(idx, 1)} disabled={idx===batchUrls.length-1}
                                          style={{ width: 24, height: 20, border: "1px solid #ccc", borderRadius: 3, background: "#fff", cursor: idx===batchUrls.length-1?"default":"pointer", fontSize: 11, color: idx===batchUrls.length-1?"#ccc":"#555", lineHeight: 1 }}>▼</button>
                                      </div>
                                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: matchRow?"#d4ece0":"#f0d0d0", color: matchRow?"#1a4733":"#c0440a", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx+1}</div>
                                      <div style={{ flex: 1, fontSize: 12, color: "#4a86c8", wordBreak: "break-all", lineHeight: 1.4 }}>{url.substring(0,55)}{url.length>55?"…":""}</div>
                                      <button onClick={() => removeBatchUrl(idx)}
                                        style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 4, border: "1px solid #f0a0a0", background: "#fff0f0", color: "#c0440a", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                              <button onClick={() => { setBatchUrls([]); }}
                                style={{ flex: 1, padding: "9px", borderRadius: 7, border: "1.5px solid #ccc", background: "#fff", color: "#555", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                                重新貼上
                              </button>
                              <button disabled={running} onClick={applyBatchUrls}
                                style={{ flex: 2, padding: "9px", borderRadius: 7, border: "none", background: running?"#8a8a82":accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: running?"wait":"pointer", fontFamily: "inherit" }}>
                                ✅ 確認套用到精選表
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 勾選批次操作列 */}
                    {checkedRows.size > 0 && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, padding: "8px 10px", background: "#fff8f0", borderRadius: 8, border: `1px solid ${C.orange}`, alignItems: "center" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.orange, flex: 1 }}>已選 {checkedRows.size} 則</span>
                        <button onClick={openChecked} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🌐 開啟選取</button>
                        <button onClick={deleteChecked} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🗑️ 刪除選取</button>
                      </div>
                    )}

                    {/* 全選 */}
                    {newsRows.length > 0 && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14, color: "#5a5a54", cursor: "pointer" }}>
                        <input type="checkbox" checked={checkedRows.size === newsRows.length && newsRows.length > 0} onChange={toggleAll} style={{ width: 18, height: 18, accentColor: accent }} />
                        全選／取消全選
                      </label>
                    )}

                    {/* 新聞列表 */}
                    {loadingNews ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#8a8a82" }}>載入精選表中…</div>
                    ) : newsRows.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#8a8a82", background: "#f4f4f0", borderRadius: 8, fontSize: 15 }}>精選表是空的，請先完成步驟 1 和 2</div>
                    ) : newsRows.map(row => {
                      const isGoogleUrl = row.url.includes("news.google.com");
                      const isNetMedia = row.source === "網路媒體" || row.source === "";
                      const hasIssue = isGoogleUrl || isNetMedia;
                      const isChecked = checkedRows.has(row.rowNum);
                      return (
                        <div key={row.rowNum} style={{ background: isChecked?"#f0f4f1":hasIssue?"#fff8f0":"#fff", border: `1.5px solid ${isChecked?accent:hasIssue?"#f0d2b0":"#e0e0d8"}`, borderRadius: 8, padding: "10px 10px 10px 0", marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
                          {/* 勾選框 */}
                          <div style={{ padding: "2px 0 0 10px", flexShrink: 0 }}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(row.rowNum)} style={{ width: 20, height: 20, accentColor: accent, marginTop: 2 }} />
                          </div>
                          {/* 內容 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* 媒體名 + 時間 */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <span onClick={() => setEditCell({ rowNum: row.rowNum, field: "source", value: row.source })}
                                style={{ fontSize: 13, fontWeight: 700, color: isNetMedia?"#c0440a":accent, background: isNetMedia?"#fff0f0":"#eef6f0", padding: "2px 8px", borderRadius: 4, cursor: "pointer", border: `1px solid ${isNetMedia?"#f0a0a0":"#b8d4c2"}` }}>
                                {row.source||"（空白）"} ✏️
                              </span>
                              <span style={{ fontSize: 12, color: "#9a9a92" }}>{row.time?row.time.substring(5,16):""}</span>
                            </div>
                            {/* 標題 */}
                            <div onClick={() => setEditCell({ rowNum: row.rowNum, field: "title", value: row.title })}
                              style={{ fontSize: 15.5, fontWeight: 500, color: "#2a2a28", lineHeight: 1.5, marginBottom: 6, cursor: "pointer" }}>
                              {row.title} <span style={{ fontSize: 13, color: "#9a9a92" }}>✏️</span>
                            </div>
                            {/* 網址區 */}
                            {isGoogleUrl ? (
                              // Google 網址：顯示貼上新網址的輸入框
                              <div style={{ background: "#fff3cd", border: "1px solid #f0c840", borderRadius: 6, padding: "7px 9px" }}>
                                <div style={{ fontSize: 12, color: "#a05000", marginBottom: 5, fontWeight: 700 }}>⚠️ Google 轉址，請貼上真實網址：</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input placeholder="https://..." defaultValue=""
                                    id={`url-input-${row.rowNum}`}
                                    style={{ flex: 1, padding: "5px 8px", borderRadius: 5, border: "1px solid #ccc", fontSize: 13, fontFamily: "inherit" }} />
                                  <button onClick={() => {
                                    const val = document.getElementById(`url-input-${row.rowNum}`).value;
                                    pasteUrlToRow(row.rowNum, val);
                                  }} style={{ padding: "5px 10px", borderRadius: 5, border: "none", background: accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>確認</button>
                                </div>
                                <div style={{ fontSize: 11, color: "#8a8a82", marginTop: 4 }}>開啟此新聞後，複製瀏覽器網址列的網址貼入上方</div>
                              </div>
                            ) : (
                              // 正常網址
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                <div onClick={() => setEditCell({ rowNum: row.rowNum, field: "url", value: row.url })}
                                  style={{ flex: 1, fontSize: 12, color: "#4a86c8", wordBreak: "break-all", lineHeight: 1.4, cursor: "pointer" }}>
                                  {row.url ? row.url.substring(0,60)+(row.url.length>60?"…":"") : "（無網址）"}
                                </div>
                                <a href={row.url} target="_blank" rel="noreferrer"
                                  style={{ fontSize: 13, color: "#4a86c8", whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 4, border: "1px solid #b8c4e0", textDecoration: "none", flexShrink: 0 }}>
                                  開啟
                                </a>
                                <button onClick={() => deleteRow(row.rowNum, row.title)}
                                  style={{ fontSize: 13, color: C.red, padding: "2px 8px", borderRadius: 4, border: `1px solid #f0a0a0`, background: "#fff0f0", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0 }}>
                                  刪除
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* 手動新增新聞 */}
                    {step.withManualAdd && (
                      <div style={{ background: "#f4f4f0", border: "1px dashed #c8c8be", borderRadius: 8, padding: "12px", marginTop: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#6a6a62", marginBottom: 6 }}>📥 手動補充遺漏的新聞</div>
                        <div style={{ fontSize: 14, color: "#8a8a82", marginBottom: 8, lineHeight: 1.5 }}>
                          在下方直接貼上新聞網址，點「加入並抓取」後系統會自動抓取標題與媒體名稱，加到精選表底部。
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                            placeholder="https://..."
                            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1.5px solid #c8c8be", fontSize: 15, fontFamily: "inherit" }} />
                          <button disabled={running || !manualUrl} onClick={addManualUrl}
                            style={{ padding: "9px 14px", borderRadius: 6, border: "none", background: !manualUrl?"#c8c8be":accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: manualUrl?"pointer":"not-allowed", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                            加入並抓取
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 選用工具 */}
                    {step.withOptional && (
                      <div style={{ background: "#f4f4f0", border: "1px dashed #c8c8be", borderRadius: 6, padding: "10px 12px", marginTop: 10 }}>
                        <span style={{ display: "inline-block", background: "#c8c8be", color: "#fff", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 3 }}>選用</span>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#6a6a62", margin: "5px 0 3px" }}>🔍 多筆網址批次匯入（Step 2-C）</div>
                        <div style={{ fontSize: 14, color: "#8a8a82", marginBottom: 8, lineHeight: 1.5 }}>需要在 Google Sheets「手動加入網址」分頁填好多筆網址後，再按下方按鈕批次匯入。</div>
                        <button disabled={running} onClick={() => runAction("匯入手動補充的新聞", "importManual", -1).then(() => loadNews())} style={btnStyle(true, false, running)}>
                          📥 從試算表匯入手動補充的新聞（Step 2-C）
                        </button>
                      </div>
                    )}

                    <button onClick={() => { setQualityIssues([]); advance(i); }}
                      style={{ ...btnStyle(false, true, false), marginTop: 14 }}>
                      ✓ 校對完成，進入下一步
                    </button>
                  </div>
                )}

                {/* LINE 開關 */}
                {step.withLine && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: "#f4f4f0", border: "1.5px solid #e0e0d8", borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>同步推播 LINE 群組</div>
                      <div style={{ fontSize: 13, color: "#8a8a82", marginTop: 2 }}>⚠️ LINE 每月配額有限，練習時請關閉</div>
                    </div>
                    <label style={{ position: "relative", width: 44, height: 26, flexShrink: 0 }}>
                      <input type="checkbox" checked={lineOn} onChange={e => setLineOn(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: "absolute", inset: 0, background: lineOn?C.green:"#c8c8be", borderRadius: 13, cursor: "pointer", transition: ".2s" }}>
                        <span style={{ position: "absolute", width: 20, height: 20, left: lineOn?21:3, top: 3, background: "#fff", borderRadius: "50%", transition: ".2s" }} />
                      </span>
                    </label>
                  </div>
                )}

                {/* 主要執行按鈕 */}
                {step.action && (
                  <button disabled={running} onClick={() => runAction(step.label, step.action, i)} style={btnStyle(false, false, running)}>
                    {step.btnLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div onClick={resetAll} style={{ display: "block", textAlign: "center", marginTop: 20, fontSize: 15, color: "#8a8a82", cursor: "pointer", textDecoration: "underline", padding: 8 }}>↺ 全部重置，重新開始今天的流程</div>
      <div style={{ fontSize: 14, color: "#9a9a92", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>每完成一步會自動點亮下一步。<br />進度會自動儲存，關掉再開不會消失。</div>
    </div>
  );
}
