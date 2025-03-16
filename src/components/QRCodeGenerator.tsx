import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QRCodeData } from './QRScanner';

interface QRCodeGeneratorProps {
  recordType: 'check_in' | 'check_out' | 'overtime_end';
  location?: string;
  isPrintable?: boolean; // 인쇄용 QR 코드 여부
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ 
  recordType,
  location = '샤인치과',
  isPrintable = true  // 기본값을 인쇄용으로 설정
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString('ko-KR'));
  
  // QR 코드 생성 함수
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        // QR 코드에 담을 데이터 생성
        // 인쇄용일 경우 timestamp는 포함하지 않음
        const qrData: QRCodeData = {
          type: recordType,
          location,
          qr_id: `${recordType}_${location.replace(/\s+/g, '_')}_${Date.now().toString(36)}` // 고유 식별자
        };
        
        // 인쇄용이 아닌 경우에만 timestamp 추가
        if (!isPrintable) {
          qrData.timestamp = new Date().toISOString();
        }
        
        // QR 코드 생성
        const dataUrl = await QRCode.toDataURL(JSON.stringify(qrData));
        setQrUrl(dataUrl);
      } catch (error) {
        console.error('QR 코드 생성 오류:', error);
      }
    };
    
    generateQRCode();
    
    // 1초마다 현재 시간 업데이트
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('ko-KR'));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [recordType, location, isPrintable]);
  
  // 기록 유형에 따른 라벨
  const typeLabel = {
    check_in: '출근',
    check_out: '퇴근',
    overtime_end: '시간외근무 종료'
  }[recordType];
  
  // 기록 유형에 따른 배경색
  const bgColor = {
    check_in: 'bg-blue-50',
    check_out: 'bg-amber-50',
    overtime_end: 'bg-purple-50'
  }[recordType];
  
  // 인쇄용 메시지
  const printableMessage = isPrintable 
    ? '이 QR 코드는 인쇄용으로 생성되었습니다. 스캔 시 현재 시간이 기록됩니다.' 
    : '';
  
  return (
    <div className={`p-4 rounded-xl ${bgColor} w-full max-w-xs mx-auto text-center`}>
      <h3 className="font-bold mb-2">{typeLabel} QR 코드</h3>
      <p className="text-sm text-gray-600 mb-3">위치: {location}</p>
      
      {qrUrl ? (
        <div className="bg-white p-3 rounded-lg inline-block shadow-sm">
          <img 
            src={qrUrl} 
            alt={`${typeLabel} QR 코드`} 
            className="w-64 h-64"
          />
        </div>
      ) : (
        <div className="bg-white p-3 rounded-lg inline-block shadow-sm w-64 h-64 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}
      
      <p className="mt-3 text-sm font-medium">현재 시각: {currentTime}</p>
      {isPrintable && (
        <p className="mt-1 text-xs text-red-600 font-medium">
          {printableMessage}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-600">
        * QR 코드를 스캔하여 {typeLabel}을 기록하세요.
      </p>
    </div>
  );
}; 