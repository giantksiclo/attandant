import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { EmployeeReport } from './pages/EmployeeReport';
import LeaveRequest from './pages/LeaveRequest';
import LeaveManagement from './pages/LeaveManagement';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';
// CSS는 HTML에서 직접 가져오므로 여기서는 import가 필요 없습니다.

// 앱 높이 설정 함수
const setAppHeight = () => {
  const doc = document.documentElement;
  doc.style.setProperty('--app-height', `${window.innerHeight}px`);
};

// 보안 라우트 컴포넌트
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  // 로컬 스토리지의 키 중에서 Supabase 인증 토큰 검색
  const hasAuthToken = Object.keys(localStorage).some(key => 
    key.startsWith('sb-') && key.endsWith('-auth-token')
  );
  
  if (!hasAuthToken) {
    // 세션이 없으면 로그인 페이지로 리디렉션
    console.log('인증 세션이 없습니다. 로그인 페이지로 이동합니다.');
    return <Navigate to="/login" />;
  }
  
  return children;
};

const AdminRoute = ({ children }: { children: JSX.Element }) => {
  // 로컬 스토리지의 키 중에서 Supabase 인증 토큰 검색
  const hasAuthToken = Object.keys(localStorage).some(key => 
    key.startsWith('sb-') && key.endsWith('-auth-token')
  );
  
  if (!hasAuthToken) {
    // 세션이 없으면 로그인 페이지로 리디렉션
    console.log('인증 세션이 없습니다. 로그인 페이지로 이동합니다.');
    return <Navigate to="/login" />;
  }
  
  // 관리자 권한 확인은 실제 페이지 내에서 처리 (여기서는 기본적인 인증만 확인)
  return children;
};

// 서비스 워커 등록
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('서비스 워커 등록 성공:', registration.scope);
    } catch (error) {
      console.log('서비스 워커 등록 실패:', error);
    }
  }
};

// PWA 설치 감지
window.addEventListener('beforeinstallprompt', () => {
  // 앱 설치 배너 표시 로직을 여기에 추가할 수 있음
  console.log('앱 설치 가능 상태');
});

// PWA 설치 완료 감지
window.addEventListener('appinstalled', () => {
  console.log('앱이 기기에 설치되었습니다.');
});

// 앱 시작 시 실행
window.addEventListener('DOMContentLoaded', () => {
  setAppHeight();
  registerServiceWorker();
});

// 화면 크기 변경 시 앱 높이 재설정
window.addEventListener('resize', setAppHeight);

// 루트 요소 찾기
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// React 루트 생성 및 렌더링
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/employee-report" 
          element={
            <AdminRoute>
              <EmployeeReport />
            </AdminRoute>
          } 
        />
        <Route 
          path="/leave-request" 
          element={
            <ProtectedRoute>
              <LeaveRequest />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/leave-management" 
          element={
            <AdminRoute>
              <LeaveManagement />
            </AdminRoute>
          } 
        />
      </Routes>
      <ToastContainer position="top-center" />
    </BrowserRouter>
  </React.StrictMode>
);
