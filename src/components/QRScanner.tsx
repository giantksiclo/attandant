import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';

export interface QRCodeData {
  type: 'check_in' | 'check_out' | 'overtime_end';
  timestamp: string;
  location: string;
}

interface QRScannerProps {
  onScan: (data: QRCodeData) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string | null>(null);

  const handleScan = (result: any) => {
    if (result) {
      try {
        // QR 코드에서 읽어온 데이터 파싱
        const scannedData = JSON.parse(result?.text);
        console.log('스캔된 QR 코드 데이터:', scannedData);
        
        // 타입 체크
        if (!scannedData.type || 
            !['check_in', 'check_out', 'overtime_end'].includes(scannedData.type) ||
            !scannedData.timestamp ||
            !scannedData.location) {
          setError('유효하지 않은 QR 코드입니다.');
          return;
        }
        
        // 유효한 QR 코드
        onScan(scannedData);
      } catch (error) {
        console.error('QR 코드 파싱 오류:', error);
        setError('QR 코드를 읽을 수 없습니다.');
      }
    }
  };

  const handleError = (err: Error) => {
    console.error('QR 스캐너 오류:', err);
    setError('카메라 접근에 실패했습니다.');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl overflow-hidden w-full max-w-md shadow-xl">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">QR 코드 스캔</h3>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="relative">
          <QrReader
            scanDelay={300}
            constraints={{ facingMode: 'environment' }}
            onResult={handleScan}
            videoStyle={{ width: '100%', height: 'auto' }}
            videoId="qr-video"
          />
          
          {error && (
            <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center p-4">
              <div className="text-center">
                <p className="text-red-600 font-medium mb-4">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 bg-gray-50">
          <p className="text-sm text-gray-600 text-center">
            QR 코드를 화면 중앙에 위치시켜 주세요
          </p>
        </div>
      </div>
    </div>
  );
}; 