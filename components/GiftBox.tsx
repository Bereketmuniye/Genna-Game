
import React from 'react';

interface GiftBoxProps {
  id: number;
  isOpened: boolean;
  isEmpty: boolean;
  onOpen: (id: number) => void;
}

const GiftBox: React.FC<GiftBoxProps> = ({ id, isOpened, isEmpty, onOpen }) => {
  return (
    <div 
      onClick={() => !isOpened && onOpen(id)}
      className={`
        relative w-full aspect-square cursor-pointer transition-all duration-500 transform
        ${isOpened ? 'scale-105' : 'hover:scale-105 active:scale-95'}
      `}
    >
      <div className={`
        w-full h-full rounded-xl flex items-center justify-center text-4xl
        ${isOpened 
          ? (isEmpty ? 'bg-gray-800' : 'bg-gradient-to-br from-yellow-400 to-yellow-600') 
          : 'bg-gradient-to-br from-red-600 to-red-800 gift-shake shadow-lg border-2 border-red-500/30'}
      `}>
        {!isOpened ? (
          <i className="fas fa-gift text-white"></i>
        ) : (
          isEmpty ? (
            <i className="fas fa-times text-gray-500"></i>
          ) : (
            <i className="fas fa-gem text-white animate-bounce"></i>
          )
        )}
      </div>
      
      {!isOpened && (
        <div className="absolute top-0 left-0 w-full h-full rounded-xl overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-0 w-full h-4 bg-yellow-400/50 -translate-y-1/2"></div>
          <div className="absolute top-0 left-1/2 w-4 h-full bg-yellow-400/50 -translate-x-1/2"></div>
        </div>
      )}
    </div>
  );
};

export default GiftBox;
