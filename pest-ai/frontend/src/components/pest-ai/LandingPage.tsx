import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { RetroText } from './RetroText';
import { usePageTitle } from '@/hooks/usePageTitle';

// Utility functions to detect devices
const isIPhone = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('iphone');
};

const isAndroid = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('android');
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
      staggerChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 }
  }
};

export const LandingPage: React.FC = () => {
  usePageTitle('PEST-AI | Documentation Assistant', 'Your intelligent documentation chat assistant for PEST software');
  
  const navigate = useNavigate();
  const [isIPhoneDevice] = React.useState(isIPhone());
  const [isAndroidDevice] = React.useState(isAndroid());
  const shouldHideText = isIPhoneDevice || isAndroidDevice;

  const handleStartChat = () => {
    navigate('/pest-ai/chat');
  };

  return (
    <div className="min-h-screen bg-[#1E1E1E] text-[#C0C0C0] flex items-center justify-center relative overflow-y-auto">
      {/* Home navigation button */}
      <Link 
        to="/"
        className="fixed top-4 left-4 p-3 rounded-lg hover:bg-[#1A1A1A]/80 transition-all z-30 group flex items-center gap-2"
        title="Back to ModFlow AI"
      >
        <svg className="w-5 h-5 text-[#888888] group-hover:text-[#3CE0DB]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        {!shouldHideText && (
          <span className="text-[#888888] group-hover:text-[#3CE0DB] font-medium">MODFLOW AI</span>
        )}
      </Link>

      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#121212] via-[#1E1E1E] to-[#242424] opacity-95" />

      {/* Content container */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center"
      >
        {/* Main branding */}
        <div className="text-center mb-6">
          {/* Logo con brillo más intenso */}
          <motion.div 
            variants={itemVariants}
            className="flex justify-center mb-4"
          >
            <motion.img 
              src="/pest-ai/icon.png"
              alt="PEST-AI Logo" 
              className="w-20 h-20 lg:w-32 lg:h-32 drop-shadow-[0_0_30px_rgba(60,224,219,0.4)]"
            />
          </motion.div>

          {/* Title */}
          <motion.h1 
            variants={itemVariants}
            className="text-3xl lg:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#3CE0DB] via-[#3CE0DB]/80 to-[#FFB86C]"
          >
            PEST-AI
          </motion.h1>

          {/* Subtitle */}
          <motion.p 
            variants={itemVariants}
            className="text-lg lg:text-2xl text-[#C0C0C0] mb-6 max-w-2xl mx-auto"
          >
            Your intelligent documentation chat assistant
          </motion.p>
        </div>

        {/* Feature box */}
        <motion.div
          variants={itemVariants}
          className="w-full max-w-3xl bg-[#1A1A1A]/80 backdrop-blur-lg rounded-3xl p-6 shadow-2xl border border-[#3CE0DB]/10 shadow-[#3CE0DB]/5"
        >
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Icon */}
            <motion.div
              className="w-16 h-16 bg-gradient-to-br from-[#3CE0DB] to-[#3CE0DB]/30 text-white p-3 rounded-2xl shadow-lg shadow-[#3CE0DB]/20"
              whileHover={{ scale: 1.05, rotate: 3 }}
            >
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                className="w-full h-full drop-shadow-2xl"
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                <path d="M8 10h8" />
                <path d="M8 14h6" />
              </svg>
            </motion.div>

            {/* Feature title */}
            <h2 className="text-xl font-semibold text-[#3CE0DB]">
              Interactive Documentation Chat
            </h2>

            {/* Feature description */}
            <p className="text-[#C0C0C0] max-w-2xl text-sm lg:text-base">
              <strong className="text-[#FFB86C]">AI-powered search</strong> through PEST manuals using semantic understanding and BM25 technology.
              Get accurate, technically-grounded answers leveraging chapter metadata and summaries.
            </p>

            {/* CTA Button */}
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStartChat}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-[#3CE0DB] to-[#3CE0DB]/80 rounded-full text-base lg:text-lg font-semibold hover:from-[#3CE0DB] hover:to-[#FFB86C] transition-all duration-300 shadow-lg hover:shadow-[#3CE0DB]/30 border border-[#3CE0DB]/20 text-[#1E1E1E]"
            >
              Start Exploring PEST
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      {/* Background decorations */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        {/* Top right glow */}
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2">
          <div className="w-full h-full bg-gradient-to-br from-[#3CE0DB]/20 to-[#3CE0DB]/5 rounded-full blur-3xl" />
        </div>

        {/* Bottom left glow */}
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2">
          <div className="w-full h-full bg-gradient-to-tr from-[#FFB86C]/20 to-[#3CE0DB]/10 rounded-full blur-3xl" />
        </div>

        {/* Center subtle glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
          <div className="w-full h-full bg-gradient-to-r from-[#3CE0DB]/10 via-[#FFB86C]/5 to-[#3CE0DB]/10 rounded-full blur-3xl" />
        </div>
      </motion.div>
    </div>
  );
}; 