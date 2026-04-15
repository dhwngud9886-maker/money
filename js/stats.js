// ================================================================
// stats.js  (v2 — 2026-04 리팩토링)
//
// [변경 내역]
//   - "deposit" → "income", "transfer" → "expense"
//   - calcBalance: initialBalance 파라미터 제거
//     → 잔액 = 완료된 income 합계 − 완료된 expense 합계
//   - updateStatsDisplay: initialBalance 인자 제거
// ================================================================

// ----------------------------------------------------------------
// calcBalance(entries)
// 현재 잔액 = 완료된 income 합 − 완료된 expense 합
// ※ pending / processing 상태는 잔액에 미포함
// ----------------------------------------------------------------
export function calcBalance(entries) {
  let balance = 0;
  entries.forEach((tx) => {
    if (tx.status !== "completed") return;
    if (tx.type === "income")  balance += tx.amount;
    if (tx.type === "expense") balance -= tx.amount;
  });
  return balance;
}

// ----------------------------------------------------------------
// calcTodayStats(entries)
// 오늘 날짜의 완료된 income / expense 합계
// ----------------------------------------------------------------
export function calcTodayStats(entries) {
  const today = getTodayStr();
  let depositTotal = 0, transferTotal = 0;

  entries.forEach((tx) => {
    if (tx.status !== "completed") return;
    if (tx.date !== today)         return;
    if (tx.type === "income")  depositTotal  += tx.amount;
    if (tx.type === "expense") transferTotal += tx.amount;
  });

  return { depositTotal, transferTotal };
}

// ----------------------------------------------------------------
// calcMonthStats(entries)
// 이번 달의 완료된 income / expense 합계
// ----------------------------------------------------------------
export function calcMonthStats(entries) {
  const ym = getThisMonthStr();
  let depositTotal = 0, transferTotal = 0;

  entries.forEach((tx) => {
    if (tx.status !== "completed")       return;
    if (!tx.date?.startsWith(ym))        return;
    if (tx.type === "income")  depositTotal  += tx.amount;
    if (tx.type === "expense") transferTotal += tx.amount;
  });

  return { depositTotal, transferTotal };
}

// ----------------------------------------------------------------
// calcPendingStats(entries)
// 미완료(pending + processing) 건수 및 금액 합계
// ----------------------------------------------------------------
export function calcPendingStats(entries) {
  let depositCount = 0,  depositAmount  = 0;
  let transferCount = 0, transferAmount = 0;

  entries.forEach((tx) => {
    if (tx.status === "completed") return;
    if (tx.hidden)                 return;
    if (tx.type === "income") {
      depositCount++;
      depositAmount += tx.amount;
    }
    if (tx.type === "expense") {
      transferCount++;
      transferAmount += tx.amount;
    }
  });

  return { depositCount, depositAmount, transferCount, transferAmount };
}

// ----------------------------------------------------------------
// updateStatsDisplay(entries)
// 계산 결과를 DOM에 반영
// ※ initialBalance 인자 제거 — 잔액은 entries 기반 순수 계산
// ----------------------------------------------------------------
export function updateStatsDisplay(entries) {
  const balance      = calcBalance(entries);
  const todayStats   = calcTodayStats(entries);
  const monthStats   = calcMonthStats(entries);
  const pendingStats = calcPendingStats(entries);

  setElText("balance-amount",              formatAmount(balance));
  setElText("stat-today-deposit",          "+" + formatAmount(todayStats.depositTotal));
  setElText("stat-today-transfer",         "−" + formatAmount(todayStats.transferTotal));
  setElText("stat-month-deposit",          "+" + formatAmount(monthStats.depositTotal));
  setElText("stat-month-transfer",         "−" + formatAmount(monthStats.transferTotal));
  setElText("stat-pending-deposit-count",  pendingStats.depositCount  + "건");
  setElText("stat-pending-deposit-amount", formatAmount(pendingStats.depositAmount));
  setElText("stat-pending-transfer-count", pendingStats.transferCount + "건");
  setElText("stat-pending-transfer-amount",formatAmount(pendingStats.transferAmount));

  // 탭 배지 업데이트
  updateBadge("tab-badge-deposit",     pendingStats.depositCount);
  updateBadge("tab-badge-transfer",    pendingStats.transferCount);
  updateBadge("mobile-badge-deposit",  pendingStats.depositCount);
  updateBadge("mobile-badge-transfer", pendingStats.transferCount);
}

// ================================================================
// 헬퍼
// ================================================================
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count;
  el.dataset.count = count;
  el.classList.toggle("hidden", count === 0);
}

function getTodayStr()     { return new Date().toISOString().slice(0, 10); }
function getThisMonthStr() { return new Date().toISOString().slice(0, 7);  }

export function formatAmount(n) {
  if (n == null || isNaN(n)) return "₩ 0";
  return "₩ " + Math.abs(Number(n)).toLocaleString("ko-KR");
}
