import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
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

export const PestD3Landing: React.FC = () => {
  usePageTitle('PESTD3CODE | VS Code Extension', 'VS Code extension for enhanced PEST control files');
  
  const [isIPhoneDevice] = React.useState(isIPhone());
  const [isAndroidDevice] = React.useState(isAndroid());
  const shouldHideText = isIPhoneDevice || isAndroidDevice;

  return (
    <div className="h-screen bg-[#13111C] text-white relative overflow-hidden">
      {/* Background gradient overlay - Changed to fixed */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#13111C] via-[#1A1625] to-[#241C35] opacity-95" />

      {/* Background decorations - Changed to fixed */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="fixed inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2">
          <div className="w-full h-full bg-gradient-to-br from-white/20 to-purple-700/30 rounded-full blur-3xl" />
        </div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2">
          <div className="w-full h-full bg-gradient-to-tr from-purple-800/40 to-white/20 rounded-full blur-3xl" />
        </div>
      </motion.div>

      {/* Home navigation button */}
      <Link 
        to="/"
        className="fixed top-4 left-4 p-3 rounded-lg hover:bg-white/5 transition-all z-30 group flex items-center gap-2"
        title="Back to ModFlow AI"
      >
        <svg className="w-5 h-5 text-white/70 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        {!shouldHideText && (
          <span className="text-white/70 group-hover:text-white font-medium">MODFLOW AI</span>
        )}
      </Link>

      {/* Scrollable content container */}
      <div className="h-screen overflow-y-auto">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center"
        >
          {/* Main branding */}
          <div className="text-center mb-10">
            <motion.div 
              variants={itemVariants}
              className="flex justify-center mb-4"
            >
              <motion.img 
                src="/pestd3code/icon.png"
                alt="PESTD3CODE Logo" 
                className="w-20 h-20 lg:w-32 lg:h-32 drop-shadow-[0_0_30px_rgba(147,51,234,0.4)]"
              />
            </motion.div>

            <motion.h1 
              variants={itemVariants}
              className="text-3xl lg:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-200 to-purple-400 mb-3"
            >
              PESTD3CODE
            </motion.h1>

            <motion.p 
              variants={itemVariants}
              className="text-base lg:text-lg text-white/90 mb-6 max-w-2xl mx-auto"
            >
              VS Code extension for enhanced PEST control files
            </motion.p>
          </div>

          {/* Feature box */}
          <motion.div
            variants={itemVariants}
            className="w-full max-w-3xl bg-gradient-to-b from-black/40 to-[#13111C]/60 backdrop-blur-lg rounded-3xl p-4 sm:p-8 shadow-2xl border border-white/10 mb-10"
          >
            <div className="flex flex-col gap-8">
              {/* Features section */}
              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-purple-300 text-center sm:text-left">Key Features</h2>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 mt-1 text-purple-400 flex-shrink-0">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base text-white/80">Smart Navigation & Interface with Outline Panel</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 mt-1 text-purple-400 flex-shrink-0">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base text-white/80">Enhanced Hover Tooltips & Real-time Validation</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 mt-1 text-purple-400 flex-shrink-0">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base text-white/80">PestCheck Integration & Diagnostics</span>
                  </li>
                </ul>
              </div>

              {/* CTA section */}
              <div className="flex flex-col items-center space-y-4 pt-4">
                <div className="text-center">
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">Get Started</h3>
                  <p className="text-sm text-white/70 mb-4 px-4">
                    Install from VS Code Marketplace and enhance your PEST development experience
                  </p>
                </div>
                
                <a 
                  href="https://marketplace.visualstudio.com/items?itemName=DanielLopezMella.pestd3code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full text-white text-sm sm:text-base font-semibold hover:from-purple-500 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-purple-500/30 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Install Extension
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}; 