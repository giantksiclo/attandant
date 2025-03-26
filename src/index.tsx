import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { EmployeeReport } from './pages/EmployeeReport';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';
// CSS는 HTML에서 직접 가져오므로 여기서는 import가 필요 없습니다.

// 앱 높이 설정 함수
const setAppHeight = () => {
  const doc = document.documentElement;
  doc.style.setProperty('--app-height', `${window.innerHeight}px`);
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/employee-report" element={<EmployeeReport />} />
      </Routes>
      <ToastContainer position="bottom-right" autoClose={3000} />
    </BrowserRouter>
  </React.StrictMode>
);
