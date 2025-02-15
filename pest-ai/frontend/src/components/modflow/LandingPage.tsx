import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import './LandingPage.css';  // Importar el CSS

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

export const ModFlowLanding: React.FC = () => {
  usePageTitle('MODFLOW AI | Computational Intelligence', 'Advanced computational intelligence tools for groundwater modeling');
  
  const [isIPhoneDevice] = React.useState(isIPhone());
  const [isAndroidDevice] = React.useState(isAndroid());
  const shouldHideText = isIPhoneDevice || isAndroidDevice;

  return (
    <div className="min-h-screen text-white flex items-center justify-center relative overflow-hidden bg-gradient">
      {/* Content container */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col items-center justify-center min-h-screen"
      >
        {/* Logo and Title */}
        <motion.div variants={itemVariants} className="text-center mb-20 pt-20">
          <motion.div className="relative mb-8">
            <motion.img 
              src="/modflow/modflowai.png"
              alt="ModFlow AI" 
              className={`w-32 h-32 lg:w-48 lg:h-48 object-contain filter brightness-[2.5] mx-auto
                drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]
                drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]
                drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]
                drop-shadow-[0_0_3px_rgba(255,255,255,0.9)]
                logo-pulse`}
              style={{ 
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
                willChange: 'filter, transform'
              }}
            />
          </motion.div>
          <h1 className="text-4xl lg:text-6xl font-bold mb-2 text-white glow-effect">
            MODFLOW AI
          </h1>
          <p className="text-xl text-gray-400 pt-4">
            Computational Intelligence
          </p>
        </motion.div>

        {/* Tools Grid */}
        <motion.div variants={itemVariants} className="grid md:grid-cols-2 gap-8 w-full max-w-4xl mb-auto">
          {/* PEST-AI Card */}
          <Link to="/pest-ai" className="group">
            <div className="bg-black/20 rounded-2xl p-6 border border-white/5 
              transition-all duration-500 hover:bg-black/40
              hover:shadow-[0_0_30px_rgba(45,212,191,0.1)]
              hover:border-teal-500/20">
              <div className="flex items-center gap-6">
                <img 
                  src="/pest-ai/icon.png" 
                  alt="PEST-AI" 
                  className="w-16 h-16 transition-all duration-500
                    group-hover:opacity-100 opacity-70
                    group-hover:drop-shadow-[0_0_15px_rgba(45,212,191,0.3)]"
                />
                <div className="transition-all duration-500 group-hover:opacity-100 opacity-70">
                  <h3 className="text-xl font-extrabold text-white group-hover:text-teal-300">PEST-AI</h3>
                  <p className="text-gray-400">Documentation Assistant</p>
                </div>
              </div>
            </div>
          </Link>

          {/* PESTD3CODE Card */}
          <Link to="/pestd3code" className="group">
            <div className="bg-black/20 rounded-2xl p-6 border border-white/5 
              transition-all duration-500 hover:bg-black/40
              hover:shadow-[0_0_30px_rgba(147,51,234,0.1)]
              hover:border-purple-500/20">
              <div className="flex items-center gap-6">
                <img 
                  src="/pestd3code/icon.png" 
                  alt="PestD3code" 
                  className="w-16 h-16 transition-all duration-500
                    group-hover:opacity-100 opacity-70
                    group-hover:drop-shadow-[0_0_15px_rgba(147,51,234,0.3)]"
                />
                <div className="transition-all duration-500 group-hover:opacity-100 opacity-70">
                  <h3 className="text-xl font-extrabold text-white group-hover:text-purple-300">PestD3code</h3>
                  <p className="text-gray-400">VSCode Extension</p>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Footer */}
        <motion.footer 
          variants={itemVariants} 
          className="text-gray-400 text-sm text-center py-4 mt-20 border-t border-white/5 w-full"
        >
          © 2025 MODFLOW AI. All rights reserved. | <a href="/contact" className="hover:text-white transition-colors">Contact</a>
        </motion.footer>
      </motion.div>
    </div>
  );
}; 