import React, { useState, useRef, useEffect } from 'react';
import { ThinkingAnimation } from './ThinkingAnimation';
import { RetroText } from './RetroText';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

// Use environment variable or fallback to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Utility function to detect iPhone
const isIPhone = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('iphone');
};

// Utility function to detect Android
const isAndroid = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('android');
};

export const ChatTest: React.FC = () => {
  usePageTitle('PEST-AI Chat | Documentation Assistant', 'Interactive chat assistant for PEST documentation');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<{
    text: string, 
    isBot: boolean,
    followUpQuestions?: { question: string; source: { file: string; section: string; } }[]
  }[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [thinkingStage, setThinkingStage] = useState<'searching' | 'thinking' | null>(null);
  const [isIPhoneDevice] = useState(isIPhone());
  const [isAndroidDevice] = useState(isAndroid());
  const shouldHideHeader = isIPhoneDevice || isAndroidDevice;
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState(52);
  const [cursorVisible, setCursorVisible] = useState(true);

  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const threshold = 20; // Reducido para ser más preciso
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < threshold;
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    
    // Si el usuario está en el fondo, activamos auto-scroll
    const atBottom = isNearBottom();
    setShouldAutoScroll(atBottom);
    setShowScrollButton(!atBottom);
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
    
    setShouldAutoScroll(true);
    setShowScrollButton(false);
  };

  // Scroll to bottom when messages change or stream content updates
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !shouldAutoScroll) return;

    // Si auto-scroll está activo, seguimos el contenido
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto'
    });
  }, [messages, streamContent, shouldAutoScroll]);

  useEffect(() => {
    // Process existing messages to extract follow-up questions
    setMessages(prev => prev.map(msg => {
      if (msg.isBot && !msg.followUpQuestions) {
        const { followUpQuestions } = cleanResponse(msg.text);
        return { ...msg, followUpQuestions };
      }
      return msg;
    }));
  }, []); // Run once on component mount

  // Add cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 530); // Slightly faster than 1s for a more natural feel

    return () => clearInterval(interval);
  }, []);

  const cleanResponse = (text: string) => {
    console.log("Raw text:", text);

    const followUpQuestions: { question: string; source: { file: string; section: string } }[] = [];

    // Buscar la posición de inicio de la sección "Follow-up Questions"
    const followUpHeader = /Follow-up Questions:/i;
    const headerMatch = text.match(followUpHeader);
    let questionsSection = "";
    let beforeQuestions = text;

    if (headerMatch) {
      // Dividir el texto en dos partes: antes y después de la sección "Follow-up Questions"
      const headerIndex = text.search(followUpHeader);
      beforeQuestions = text.substring(0, headerIndex);
      questionsSection = text.substring(headerIndex);
    }

    // Procesar la sección de Follow-up Questions si existe
    if (questionsSection) {
      // Extraer líneas que empiezan con guion
      const lines = questionsSection.split('\n').filter(line => line.trim().startsWith('-'));
      for (const line of lines) {
        const trimmedLine = line.trim().substring(1).trim();
        const sourceStart = trimmedLine.indexOf('(Source:');
        if (sourceStart === -1) continue;

        const questionText = trimmedLine.substring(0, sourceStart).trim();
        const sourceText = trimmedLine.substring(sourceStart);
        // Usar una regex configurable para extraer la información de la fuente
        const sourceRegex = /\(Source:\s*File:\s*([\s\S]+?),\s*Section:\s*([^)]+)\)/i;
        const sourceMatch = sourceText.match(sourceRegex);
        if (sourceMatch) {
          followUpQuestions.push({
            question: questionText,
            source: {
              file: sourceMatch[1].trim(),
              section: sourceMatch[2].trim()
            }
          });
        } else {
          console.warn("No se pudo parsear la fuente en la línea:", line);
        }
      }
    }

    // Limpiar el texto "beforeQuestions" (la parte sin la sección de preguntas)
    let cleanedText = beforeQuestions
      .replace(/^\d+\.\s*/gm, '') // Eliminar números de lista al inicio de líneas
      .replace(/```[^`]*```/g, '') // Eliminar bloques de código
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Convertir ** a etiquetas strong
      .replace(/\n{3,}/g, '\n\n') // Reducir múltiples saltos de línea
      .trim();

    // Eliminar el número solitario al final si existe
    cleanedText = cleanedText.replace(/\n\s*\d+\.?\s*$/, '');

    return {
      cleanedText,
      followUpQuestions
    };
  };
  


  const handleStreamChunk = React.useCallback((text: string) => {
    // Buscar el inicio y fin del bloque JSON
    const jsonStartIndex = text.indexOf('```json');
    const jsonEndIndex = text.indexOf('```', jsonStartIndex + 6);
    
    // Si encontramos el inicio del JSON pero no el final, no procesar aún
    if (jsonStartIndex !== -1 && jsonEndIndex === -1) {
      // Solo procesar el texto hasta el inicio del JSON
      const cleanText = text.slice(0, jsonStartIndex).trim();
      const { cleanedText } = cleanResponse(cleanText);
      setStreamContent(cleanedText);
      return;
    }
    
    // Si tenemos un bloque JSON completo
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      try {
        // Extraer y procesar el JSON, limpiando espacios extra y caracteres no deseados
        const jsonBlock = text.slice(jsonStartIndex + 6, jsonEndIndex)
          .trim()
          .replace(/^\s+|\s+$/g, '') // Eliminar espacios al inicio y final
          .replace(/\n\s*/g, ''); // Eliminar saltos de línea y espacios después de ellos
        
        // Verificar que el JSON comienza y termina correctamente
        if (!jsonBlock.startsWith('{') || !jsonBlock.endsWith('}')) {
          throw new Error('Invalid JSON format');
        }
        
        const jsonData = JSON.parse(jsonBlock);
        
        if (jsonData.follow_up_questions && Array.isArray(jsonData.follow_up_questions)) {
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              lastMessage.followUpQuestions = jsonData.follow_up_questions;
            }
            return newMessages;
          });
        }
        
        // Limpiar el texto eliminando el bloque JSON y su encabezado
        const beforeJson = text.slice(0, jsonStartIndex);
        const afterJson = text.slice(jsonEndIndex + 3);
        const cleanText = (beforeJson + afterJson).trim();
          
        const { cleanedText } = cleanResponse(cleanText);
        setStreamContent(cleanedText);
      } catch (e) {
        console.error('Error parsing follow-up questions JSON:', e);
        // En caso de error, mostrar el texto sin el JSON
        const cleanText = text.slice(0, jsonStartIndex).trim();
        const { cleanedText } = cleanResponse(cleanText);
        setStreamContent(cleanedText);
      }
    } else {
      // Si no hay JSON, procesar todo el texto normalmente
      const { cleanedText } = cleanResponse(text);
      setStreamContent(cleanedText);
    }
  }, []);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || isLoading) return;

    setMessages(prev => [...prev, { text: messageInput, isBot: false }]);
    setMessageInput('');
    setIsLoading(true);
    setStreamContent('');
    setThinkingStage('searching');
    setShouldAutoScroll(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/search/search_gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: messageInput }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';

      // Change to thinking stage after 2 seconds
      const thinkingTimer = setTimeout(() => setThinkingStage('thinking'), 2000);

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          clearTimeout(thinkingTimer);
          const { cleanedText, followUpQuestions } = cleanResponse(text);
          setMessages(prev => [...prev, { 
            text: cleanedText, 
            isBot: true,
            followUpQuestions 
          }]);
          setStreamContent('');
          break;
        }

        const chunk = decoder.decode(value);
        if (chunk) {
          setThinkingStage(null);
          text += chunk;
          handleStreamChunk(text);
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { text: `Error: ${error.message}`, isBot: true }]);
    } finally {
      setIsLoading(false);
      setThinkingStage(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-[#1E1E1E] text-[#C0C0C0] flex justify-center font-sans antialiased relative overflow-hidden">
      {/* Background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#121212] via-[#1E1E1E] to-[#242424] opacity-95" />

      {/* Main centered container */}
      <div className="w-[896px] flex flex-col relative z-10">
        {/* Navigation buttons */}
        <div className="fixed top-4 left-4 flex items-center gap-2 z-30">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-2 rounded-lg hover:bg-white/5 text-white/70 hover:text-white transition-all"
              aria-label="Clear chat"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <Link 
            to="/"
            className="p-3 rounded-lg hover:bg-white/5 transition-all group flex items-center gap-2"
            title="Back to ModFlow AI"
          >
            <svg className="w-5 h-5 text-white/70 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </Link>
        </div>

        {/* Header - Hidden on mobile devices */}
        {!shouldHideHeader && (
          <header className="fixed top-0 left-0 right-0 border-b border-white/10 bg-black/30 backdrop-blur-sm z-20">
            <div className="flex items-center justify-center h-20">
              <div className="flex items-center gap-4"> 
                <img src="/pest-ai/icon.png" alt="PEST-AI Logo" className="w-16 h-16 drop-shadow-[0_0_30px_rgba(45,212,191,0.4)]" />
                <div>
                  <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-teal-200 to-teal-400">MODFLOW AI</h1>
                  <p className="text-white/90 text-base">Advanced computational intelligence tools for groundwater modeling</p>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Add padding to account for fixed header */}
        {!shouldHideHeader && <div className="h-20" />}

        {/* Messages Area */}
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-teal-600/50 scrollbar-track-transparent"
          style={{ height: 'calc(100vh - 12.5rem)' }}
        >
          <div className="px-4 py-4 min-h-full flex flex-col">
            {messages.length === 0 && !isLoading && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold bg-gradient-to-r from-[#FFB86C] to-[#FFD700]/80 bg-clip-text text-transparent">Welcome to PEST-AI Assistant</h2>
                  <p className="text-white/80 text-sm">Ask me anything about PEST software and documentation</p>
                </div>
                
                {/* Popular questions */}
                <div className="w-full max-w-lg">
                  <div className="text-sm bg-gradient-to-r from-[#FFB86C] to-[#FFD700]/80 bg-clip-text text-transparent font-medium mb-2">Popular questions:</div>
                  <button 
                    onClick={() => setMessageInput("What is PEST?")}
                    className="w-full text-left px-4 py-3 rounded-xl bg-[#1A1A1A]/80 hover:bg-[#1A1A1A] backdrop-blur-sm border border-white/10 hover:border-[#3CE0DB]/50 focus:border-[#3CE0DB]/50 focus:ring-1 focus:ring-[#3CE0DB]/25 outline-none transition-all duration-200"
                  >
                    <div className="text-[#3CE0DB] font-medium">What is PEST?</div>
                    <div className="text-sm text-[#888888] mt-1">Learn about PEST's core functionality and purpose</div>
                  </button>
                </div>
                
                {/* Terminal section */}
                <div className="w-full max-w-lg">
                  <div className="text-sm bg-gradient-to-r from-[#FFB86C] to-[#FFD700]/80 bg-clip-text text-transparent font-medium mb-2">Why don't you try a keyword?</div>
                  <div className="bg-[#1A1A1A]/90 backdrop-blur-sm rounded-xl border border-[#3CE0DB]/10 shadow-2xl overflow-hidden">
                    {/* Terminal header */}
                    <div className="bg-[#1A1A1A] px-2 py-1.5 flex items-center justify-end border-b border-[#3CE0DB]/10">
                      <div className="flex gap-0.5">
                        <button className="w-8 h-5 flex items-center justify-center hover:bg-[#3CE0DB]/5">
                          <svg className="w-3 h-3 text-[#888888]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4"/>
                          </svg>
                        </button>
                        <button className="w-8 h-5 flex items-center justify-center hover:bg-[#3CE0DB]/5">
                          <svg className="w-2.5 h-2.5 text-[#888888]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="4" y="4" width="16" height="16" rx="1"/>
                          </svg>
                        </button>
                        <button className="w-8 h-5 flex items-center justify-center hover:bg-red-500/20">
                          <svg className="w-3 h-3 text-[#888888]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Terminal content */}
                    <div className="p-4 space-y-1 font-mono text-base relative text-left">
                      {/* Scanline effect */}
                      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-[#3CE0DB]/[0.02] to-transparent animate-scan" />
                      {/* CRT flicker */}
                      <div className="absolute inset-0 pointer-events-none bg-white/[0.01] animate-flicker" />
                      
                      <div className="text-[#3CE0DB] text-left flex items-center">
                        <span className="text-[#E6A959] italic">C:\Users\gwm{`>`}</span>
                        <span className={`ml-0.5 text-[#FFB86C] transition-opacity duration-0 ${cursorVisible ? 'opacity-100' : 'opacity-0'}`}>|</span>
                      </div>
                      <RetroText 
                        words={[
                          "pcf",
                          "* control data",
                          "RSTFLE PESTMODE",
                          "NPAR NOBS NPARGP NPRIOR NOBSGP",
                          "NTPLFLE NINSFLE PRECIS DPOINT",
                          "RLAMBDA1 RLAMFAC PHIRATSUF PHIREDLAM NUMLAM",
                          "RELPARMAX FACPARMAX FACORIG",
                          "PHIREDSWH",
                          "NOPTMAX PHIREDSTP NPHISTP NPHINORED RELPARSTP NRELPAR",
                          "ICOV ICOR IEIG"
                        ]}
                        className="flex flex-col items-start font-medium tracking-wide"
                        onWordClick={(word) => setMessageInput(`What is ${word}?`)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className="space-y-3">
                <div className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'} w-full`}>
                  <div className={`max-w-[95%] ${
                    msg.isBot 
                      ? 'bg-black/40 backdrop-blur-sm rounded-2xl rounded-tl-sm text-white/90' 
                      : 'bg-[#3CE0DB]/20 rounded-2xl rounded-tr-sm border-[#3CE0DB]/20'
                  } px-6 py-4 shadow-lg border ${msg.isBot ? 'border-white/10' : 'border-[#3CE0DB]/20'}`}>
                    <pre className="text-left whitespace-pre-wrap break-words font-sans leading-relaxed text-[15px] text-white"
                      dangerouslySetInnerHTML={{ __html: msg.text }}
                    />
                  </div>
                </div>

                {/* Follow-up questions and feedback for bot messages */}
                {msg.isBot && (
                  <div className="space-y-3 pl-4">
                    {/* Feedback buttons - Always show for bot messages */}
                    <div className="flex gap-2">
                      <button 
                        className="text-sm px-3 py-1 rounded-lg bg-[#1A1A1A]/80 hover:bg-[#1A1A1A] text-[#888888] hover:text-[#C0C0C0] transition-colors"
                        onClick={() => console.log('Helpful')}
                      >
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                          </svg>
                          Helpful
                        </span>
                      </button>
                      <button 
                        className="text-sm px-3 py-1 rounded-lg bg-[#1A1A1A]/80 hover:bg-[#1A1A1A] text-[#888888] hover:text-[#C0C0C0] transition-colors"
                        onClick={() => console.log('Not helpful')}
                      >
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                          </svg>
                          Not helpful
                        </span>
                      </button>
                    </div>

                    {/* Follow-up questions - Only show when they exist */}
                    {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm text-white/70">Follow-up questions:</div>
                        <div className="grid gap-2">
                          {msg.followUpQuestions.map((question, qIdx) => (
                            <button 
                              key={qIdx}
                              onClick={() => setMessageInput(question.question)}
                              className="text-left px-3 py-2 rounded-xl bg-[#1A1A1A]/80 hover:bg-[#1A1A1A] backdrop-blur-sm border border-white/10 transition-colors group"
                            >
                              <div className="text-[#3CE0DB] text-sm group-hover:text-[#FFB86C]">{question.question}</div>
                              <div className="text-xs text-[#888888] mt-1 group-hover:text-[#C0C0C0]">
                                Source: {question.source.section}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start w-full">
                <div className="max-w-[95%] bg-black/40 backdrop-blur-sm rounded-2xl rounded-tl-sm text-white/90 px-6 py-4 shadow-lg">
                  {!streamContent && <ThinkingAnimation stage={thinkingStage} isIPhoneDevice={isIPhoneDevice} />}
                  {streamContent && (
                    <pre className="text-left whitespace-pre-wrap break-words font-sans leading-relaxed text-[15px]"
                      dangerouslySetInnerHTML={{ __html: streamContent }}
                    />
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
            {/* Padding div to prevent overlap with input */}
            <div className={isIPhoneDevice ? 'h-40' : 'h-16'} />
          </div>
        </div>

        {/* Input Area */}
        <div className={`${
          isIPhoneDevice 
            ? 'fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#0f1518]/80 backdrop-blur-sm' 
            : 'fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/30 backdrop-blur-sm z-20'
        }`}>
          <div className={isIPhoneDevice ? 'px-4 pt-1' : 'flex justify-center'}>
            <div className={isIPhoneDevice ? '' : 'w-[896px] px-4 py-4'}>
              <div className="relative">
                <textarea
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value);
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about PEST..."
                  className="w-full p-5 pr-14 bg-[#1A1A1A]/80 backdrop-blur-sm rounded-2xl resize-none border border-white/10 focus:border-[#3CE0DB]/50 focus:ring-1 focus:ring-[#3CE0DB]/25 outline-none font-sans text-[15px] text-[#C0C0C0] placeholder-[#888888] overflow-y-auto"
                  style={{ 
                    height: isIPhoneDevice ? '64px' : '84px',
                    minHeight: '64px'
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !messageInput.trim()}
                  className="absolute right-4 top-2 p-2.5 text-[#3CE0DB] hover:text-[#FFB86C] disabled:opacity-50 disabled:cursor-not-allowed z-10"
                >
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Add padding to account for fixed input area in desktop */}
        {!isIPhoneDevice && <div className="h-24" />}
      </div>

      {/* Floating scroll button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={`fixed bg-teal-600/90 backdrop-blur-sm text-white rounded-full p-3 shadow-lg hover:bg-teal-700 transition-all transform hover:scale-110 z-20 ${
            isIPhoneDevice ? 'bottom-32 right-2' : 'bottom-24 right-4'
          }`}
          aria-label="Scroll to bottom"
        >
          <svg 
            className="w-6 h-6" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}; 