import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeGeneratorProps {
  recordType: 'check_in' | 'check_out' | 'overtime_end';
  location?: string;
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ 
  recordType,
  location = '샤인치과' 
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString('ko-KR'));
  
  // QR 코드 생성 함수
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        // QR 코드에 담을 데이터 생성
        const qrData = {
          type: recordType,
          timestamp: new Date().toISOString(),
          location
        };
        
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
  }, [recordType, location]);
  
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
      <p className="mt-1 text-xs text-gray-600">
        * QR 코드를 스캔하여 {typeLabel}을 기록하세요.
      </p>
    </div>
  );
}; 