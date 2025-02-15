import React from 'react';

interface ThinkingAnimationProps {
  stage: 'searching' | 'thinking' | null;
  isIPhoneDevice: boolean;
}

const SearchIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300">
    <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ThinkingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300">
    <path d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M15 14C15 14 13.5 16 12 16C10.5 16 9 14 9 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 9H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M15 9H15.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M17 6C17.5 6.5 19 8.5 19 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const ThinkingAnimation: React.FC<ThinkingAnimationProps> = ({ stage, isIPhoneDevice }) => {
  if (!stage) return null;

  return (
    <div className="flex items-center space-x-4 text-gray-300">
      <div className={`animate-pulse ${isIPhoneDevice ? 'pl-3' : 'pl-4'}`}>
        {stage === 'searching' ? <SearchIcon /> : <ThinkingIcon />}
      </div>
      <span className={`${isIPhoneDevice ? 'text-sm' : 'text-lg'} text-gray-300`}>
        {stage === 'searching' 
          ? 'Searching relevant information...' 
          : 'Analyzing information to provide the best answer...'}
      </span>
      <div className="flex space-x-1.5">
        <div className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-1 h-1 bg-teal-400 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
}; 