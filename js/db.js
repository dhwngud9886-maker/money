// ================================================================
// db.js  (v2 — 2026-04 리팩토링)
//
// [변경 내역]
//   - 컬렉션: transactions → ledger_entries
//   - 필드:   name → counterparty, destination → accountName
//   - 타입값: "deposit" → "income", "transfer" → "expense"
//   - 상태:   pending / processing / completed (3단계로 단순화)
//   - 제거:   saveBalance, subscribeToBalance (잔액은 stats.js 계산만 사용)
// ================================================================

import {
  collection, doc,
  addDoc, updateDoc, deleteDoc,
  onSnapshot, getDoc,
  serverTimestamp,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase-config.js";

// ── 컬렉션 상수 ──
const COL = "ledger_entries";   // ← 핵심 변경: transactions → ledger_entries

// ================================================================
// 거래 항목 추가
// ================================================================

// ----------------------------------------------------------------
// addEntry(data, user)
// 새 항목을 ledger_entries 컬렉션에 추가
//
// data = {
//   type:         "income" | "expense"   ← deposit/transfer 대신
//   date:         "2026-04-15"
//   counterparty: "거래처명"             ← name 대신
//   amount:       350000
//   memo:         "메모"
//   accountName:  "국민은행 123-456"     ← destination 대신 (expense 시)
// }
// ----------------------------------------------------------------
export async function addEntry(data, user) {
  // 필수값 검증
  if (!data.date)                    throw new Error("날짜를 입력해주세요.");
  if (!data.counterparty?.trim())    throw new Error("거래처/입금자명을 입력해주세요.");
  if (!data.amount || Number(data.amount) <= 0)
                                     throw new Error("올바른 금액을 입력해주세요.");

  const userName = user.displayName || user.email.split("@")[0];

  const newDoc = {
    // ── 기본 정보 ──
    type:         data.type,                        // "income" | "expense"
    date:         data.date,
    counterparty: data.counterparty.trim(),         // 거래처 / 입금자
    amount:       Number(data.amount),
    memo:         data.memo?.trim()        || "",
    accountName:  data.accountName?.trim() || "",   // 수신 계좌 (expense만 사용)

    // ── 상태 ──
    // pending → processing → completed
    status: "pending",

    // ── 표시 옵션 ──
    isNew:  true,    // 상대방이 미확인 항목 표시용
    hidden: false,   // 완료 후 숨기기

    // ── 작성자 정보 ──
    createdBy:     user.uid,
    createdByName: userName,
    createdAt:     serverTimestamp(),

    // ── 완료 처리 정보 (초기: null) ──
    completedBy:     null,
    completedByName: null,
    completedAt:     null,

    // ── 수정 정보 (초기: null) ──
    updatedBy:     null,
    updatedByName: null,
    updatedAt:     null,
    isEdited:      false,

    // ── 변경 이력 ──
    history: [{
      action: "created",
      by:     userName,
      byUid:  user.uid,
      at:     new Date().toISOString(),
      detail: "최초 등록"
    }]
  };

  const docRef = await addDoc(collection(db, COL), newDoc);
  return docRef.id;
}

// ================================================================
// 거래 항목 수정
// ================================================================

// ----------------------------------------------------------------
// updateEntry(id, data, user)
// 기존 항목의 내용을 수정 (상태 무관 — 대기/완료 모두 수정 가능)
// ----------------------------------------------------------------
export async function updateEntry(id, data, user) {
  if (!data.date)                 throw new Error("날짜를 입력해주세요.");
  if (!data.counterparty?.trim()) throw new Error("거래처/입금자명을 입력해주세요.");
  if (!data.amount || Number(data.amount) <= 0)
                                  throw new Error("올바른 금액을 입력해주세요.");

  const userName = user.displayName || user.email.split("@")[0];

  const historyEntry = {
    action: "updated",
    by:     userName,
    byUid:  user.uid,
    at:     new Date().toISOString(),
    detail: `내용 수정 — 금액: ${Number(data.amount).toLocaleString("ko-KR")}원`
  };

  await updateDoc(doc(db, COL, id), {
    date:         data.date,
    counterparty: data.counterparty.trim(),
    amount:       Number(data.amount),
    memo:         data.memo?.trim()        || "",
    accountName:  data.accountName?.trim() || "",
    isEdited:      true,
    updatedBy:     user.uid,
    updatedByName: userName,
    updatedAt:     serverTimestamp(),
    history:       await appendHistory(id, historyEntry)
  });
}

// ================================================================
// 상태 변경
// ================================================================

// ----------------------------------------------------------------
// changeStatus(id, newStatus, user, currentStatus)
//
// 상태 흐름:
//   pending → processing → completed
//
// completed가 되면 잔액에 자동 반영됨 (stats.js 계산)
// ----------------------------------------------------------------
export async function changeStatus(id, newStatus, user, currentStatus) {
  const userName    = user.displayName || user.email.split("@")[0];
  const prevLabel   = getStatusLabel(currentStatus);
  const nextLabel   = getStatusLabel(newStatus);

  const historyEntry = {
    action: "status_changed",
    by:     userName,
    byUid:  user.uid,
    at:     new Date().toISOString(),
    detail: `${prevLabel} → ${nextLabel}`
  };

  const updateData = {
    status:    newStatus,
    isNew:     false,
    updatedAt: serverTimestamp(),
    history:   await appendHistory(id, historyEntry)
  };

  // 완료 시 처리자 정보 기록
  if (newStatus === "completed") {
    updateData.completedBy     = user.uid;
    updateData.completedByName = userName;
    updateData.completedAt     = serverTimestamp();
  }

  await updateDoc(doc(db, COL, id), updateData);
}

// ================================================================
// 삭제 / 숨기기
// ================================================================

// ----------------------------------------------------------------
// deleteEntry(id)
// 항목 완전 삭제 — 대기 항목에만 UI에서 버튼 노출
// ----------------------------------------------------------------
export async function deleteEntry(id) {
  await deleteDoc(doc(db, COL, id));
}

// ----------------------------------------------------------------
// hideEntry(id) / unhideEntry(id)
// 완료 항목 숨기기 / 복원 (실제 삭제 아님)
// ----------------------------------------------------------------
export async function hideEntry(id) {
  await updateDoc(doc(db, COL, id), { hidden: true });
}

export async function unhideEntry(id) {
  await updateDoc(doc(db, COL, id), { hidden: false });
}

// ----------------------------------------------------------------
// markAsSeen(id)
// NEW 표시 해제
// ----------------------------------------------------------------
export async function markAsSeen(id) {
  await updateDoc(doc(db, COL, id), { isNew: false });
}

// ================================================================
// 실시간 구독
// ================================================================

// ----------------------------------------------------------------
// subscribeToEntries(callback)
// ledger_entries 컬렉션 실시간 리스너
// 데이터 변경 시 callback(entries[]) 자동 호출
// 반환: unsubscribe 함수
// ----------------------------------------------------------------
export function subscribeToEntries(callback) {
  const q = query(
    collection(db, COL),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      // Firestore Timestamp → JS Date 변환
      createdAt:   toJsDate(d.data().createdAt),
      completedAt: toJsDate(d.data().completedAt),
      updatedAt:   toJsDate(d.data().updatedAt),
    }));
    callback(entries);
  }, (error) => {
    console.error("[db] 구독 오류:", error);
    callback([], error);
  });
}

// ================================================================
// 헬퍼 함수
// ================================================================

// Firestore Timestamp → JS Date (null 안전 처리)
function toJsDate(value) {
  if (!value)           return null;
  if (value instanceof Date) return value;
  if (value?.toDate)    return value.toDate();
  return null;
}

// ----------------------------------------------------------------
// getStatusLabel(status)
// 상태 코드 → 한국어 레이블 (타입 무관 공통 레이블)
// 타입별 세부 표현은 ui.js의 buildStatusBadge에서 처리
// ----------------------------------------------------------------
export function getStatusLabel(status) {
  const labels = {
    pending:    "대기",
    processing: "진행중",
    completed:  "완료"
  };
  return labels[status] ?? status;
}

// 기존 history 배열에 새 항목 추가 후 반환
async function appendHistory(id, newEntry) {
  const snap     = await getDoc(doc(db, COL, id));
  const existing = snap.exists() ? (snap.data().history ?? []) : [];
  return [...existing, newEntry];
}
