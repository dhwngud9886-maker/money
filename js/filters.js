// ================================================================
// filters.js  (v2 — 2026-04 리팩토링)
//
// [변경 내역]
//   - "deposit" → "income", "transfer" → "expense"
//   - 탭 키: "income-pending", "expense-pending" 으로 통일
//   - 검색 필드: name → counterparty, destination → accountName
// ================================================================

// ----------------------------------------------------------------
// applyAllFilters(entries, filterState)
// 모든 필터를 순서대로 적용 후 정렬 결과 반환
// ----------------------------------------------------------------
export function applyAllFilters(entries, filterState) {
  let result = [...entries];

  result = filterByHidden(result, filterState.showHidden);

  if (filterState.keyword?.trim()) {
    result = filterByKeyword(result, filterState.keyword.trim());
  }
  if (filterState.dateFilter && filterState.dateFilter !== "all") {
    result = filterByDate(result, filterState.dateFilter);
  }
  if (filterState.statusFilter && filterState.statusFilter !== "all") {
    result = filterByStatus(result, filterState.statusFilter);
  }
  if (filterState.amountMin !== null || filterState.amountMax !== null) {
    result = filterByAmount(result, filterState.amountMin, filterState.amountMax);
  }

  return sortEntries(result, filterState.sortBy || "newest");
}

// ----------------------------------------------------------------
// filterByHidden — hidden:true 항목 제어
// ----------------------------------------------------------------
export function filterByHidden(entries, showHidden = false) {
  return showHidden ? entries : entries.filter((tx) => !tx.hidden);
}

// ----------------------------------------------------------------
// filterByKeyword — counterparty / memo / accountName 검색
// ----------------------------------------------------------------
export function filterByKeyword(entries, keyword) {
  const lower = keyword.toLowerCase();
  return entries.filter((tx) =>
    (tx.counterparty || "").toLowerCase().includes(lower) ||
    (tx.memo         || "").toLowerCase().includes(lower) ||
    (tx.accountName  || "").toLowerCase().includes(lower)
  );
}

// ----------------------------------------------------------------
// filterByDate — today | week
// ----------------------------------------------------------------
export function filterByDate(entries, dateFilter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dateFilter === "today") {
    const todayStr = today.toISOString().slice(0, 10);
    return entries.filter((tx) => tx.date === todayStr);
  }

  if (dateFilter === "week") {
    const weekStart = new Date(today);
    const day  = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diff);
    const from = weekStart.toISOString().slice(0, 10);
    const to   = today.toISOString().slice(0, 10);
    return entries.filter((tx) => tx.date >= from && tx.date <= to);
  }

  return entries;
}

// ----------------------------------------------------------------
// filterByStatus — pending | processing | completed
// ----------------------------------------------------------------
export function filterByStatus(entries, statusFilter) {
  return entries.filter((tx) => tx.status === statusFilter);
}

// ----------------------------------------------------------------
// filterByAmount — 금액 범위
// ----------------------------------------------------------------
export function filterByAmount(entries, min, max) {
  return entries.filter((tx) => {
    if (min !== null && !isNaN(min) && tx.amount < Number(min)) return false;
    if (max !== null && !isNaN(max) && tx.amount > Number(max)) return false;
    return true;
  });
}

// ----------------------------------------------------------------
// filterByType — "income" | "expense"
// ----------------------------------------------------------------
export function filterByType(entries, type) {
  if (!type || type === "all") return entries;
  return entries.filter((tx) => tx.type === type);
}

// ----------------------------------------------------------------
// sortEntries — newest | oldest | amount-desc | amount-asc
// ----------------------------------------------------------------
export function sortEntries(entries, sortBy) {
  const arr = [...entries];
  switch (sortBy) {
    case "newest":
      return arr.sort((a, b) => {
        const diff = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        return diff !== 0 ? diff : b.date.localeCompare(a.date);
      });
    case "oldest":
      return arr.sort((a, b) => {
        const diff = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
        return diff !== 0 ? diff : a.date.localeCompare(b.date);
      });
    case "amount-desc": return arr.sort((a, b) => b.amount - a.amount);
    case "amount-asc":  return arr.sort((a, b) => a.amount - b.amount);
    default: return arr;
  }
}

// ----------------------------------------------------------------
// getTabTransactions(entries, tab, completedFilter, showHidden)
// 탭별 기본 분리 (필터/정렬 전 단계)
//
// tab: "income-pending" | "expense-pending" | "completed"
// completedFilter: "all" | "income" | "expense"
// ----------------------------------------------------------------
export function getTabTransactions(entries, tab, completedFilter = "all", showHidden = false) {
  switch (tab) {
    case "income-pending":
      return entries.filter(
        (tx) => tx.type === "income" &&
                tx.status !== "completed" &&
                !tx.hidden
      );

    case "expense-pending":
      return entries.filter(
        (tx) => tx.type === "expense" &&
                tx.status !== "completed" &&
                !tx.hidden
      );

    case "completed": {
      let result = entries.filter((tx) => tx.status === "completed");
      if (!showHidden) result = result.filter((tx) => !tx.hidden);
      if (completedFilter !== "all") result = filterByType(result, completedFilter);
      return result;
    }

    default:
      return entries;
  }
}
