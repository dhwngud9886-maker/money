// ================================================================
// auth.js
// Firebase Authentication 관련 로직
// 로그인, 로그아웃, 현재 사용자 정보 관리
// ================================================================

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "./firebase-config.js";

// ----------------------------------------------------------------
// login(email, password)
// 이메일/비밀번호로 로그인
// 반환: Promise<UserCredential>  실패 시 throw Error
// ----------------------------------------------------------------
export async function login(email, password) {
  // 입력값 기본 검증
  if (!email || !email.trim()) throw new Error("이메일을 입력해주세요.");
  if (!password)               throw new Error("비밀번호를 입력해주세요.");

  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  } catch (err) {
    // Firebase 오류 코드를 사람이 읽기 쉬운 메시지로 변환
    throw new Error(translateAuthError(err.code));
  }
}

// ----------------------------------------------------------------
// logout()
// 현재 사용자 로그아웃
// ----------------------------------------------------------------
export async function logout() {
  await signOut(auth);
}

// ----------------------------------------------------------------
// onAuthChange(callback)
// 로그인 상태가 바뀔 때마다 callback 실행
// callback(user) — user가 null이면 로그아웃 상태
// 반환: unsubscribe 함수 (리스너 해제용)
// ----------------------------------------------------------------
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ----------------------------------------------------------------
// getCurrentUser()
// 현재 로그인된 사용자 객체 반환 (없으면 null)
// ----------------------------------------------------------------
export function getCurrentUser() {
  return auth.currentUser;
}

// ----------------------------------------------------------------
// getUserDisplayName(user)
// 사용자 표시 이름 반환
// displayName이 없으면 이메일 앞부분을 이름으로 사용
// ----------------------------------------------------------------
export function getUserDisplayName(user) {
  if (!user) return "알 수 없음";
  if (user.displayName) return user.displayName;
  // 이메일에서 @ 앞부분 추출 (예: hong@gmail.com → hong)
  return user.email ? user.email.split("@")[0] : "사용자";
}

// ----------------------------------------------------------------
// translateAuthError(code)
// Firebase Auth 오류 코드 → 한국어 메시지 변환 (내부 함수)
// ----------------------------------------------------------------
function translateAuthError(code) {
  const messages = {
    "auth/user-not-found":      "등록되지 않은 이메일입니다.",
    "auth/wrong-password":      "비밀번호가 올바르지 않습니다.",
    "auth/invalid-email":       "이메일 형식이 올바르지 않습니다.",
    "auth/user-disabled":       "비활성화된 계정입니다. 관리자에게 문의하세요.",
    "auth/too-many-requests":   "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    "auth/network-request-failed": "네트워크 연결을 확인해주세요.",
    "auth/invalid-credential":  "이메일 또는 비밀번호가 올바르지 않습니다.",
  };
  return messages[code] || "로그인 중 오류가 발생했습니다. 다시 시도해주세요.";
}
