import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ModFlowLanding } from './components/modflow/LandingPage';
import { LandingPage as PestAILanding } from './components/pest-ai/LandingPage';
import { PestD3Landing } from './components/pestd3code/LandingPage';
import { ChatTest } from './components/pest-ai/ChatTest';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import './App.css'

const queryClient = new QueryClient();

export const App: React.FC = () => {
  useEffect(() => {
    document.title = "MODFLOW AI";
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router>
          <Routes>
            {/* Ruta principal - ModFlow AI Landing */}
            <Route path="/" element={<ModFlowLanding />} />
            
            {/* PEST-AI Routes */}
            <Route path="/pest-ai/*" element={<PestAILanding />} />
            <Route path="/pest-ai/chat/*" element={<ChatTest />} />
            
            {/* PESTD3CODE Routes */}
            <Route path="/pestd3code/*" element={<PestD3Landing />} />
            
            {/* Fallback route - Redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          <Sonner />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;