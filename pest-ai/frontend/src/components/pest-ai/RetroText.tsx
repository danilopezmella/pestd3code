import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Define props interface
interface RetroTextProps {
  words: string[];
  className?: string;
  onWordClick?: (word: string) => void;
}

export const RetroText: React.FC<RetroTextProps> = ({ words, className = '', onWordClick }) => {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [visibleWords, setVisibleWords] = useState<Set<string>>(new Set());

  // Procesar las líneas
  const processedWords = words.map((line, lineIndex) => {
    // Manejar "* control data" como una unidad especial
    if (lineIndex === 1) {
      return {
        line,
        parts: [{
          text: line,
          isClickable: true,
          canBlink: false
        }]
      };
    }

    // Para el resto de las líneas, dividir normalmente
    const parts = line.split(/(\s+)/g).filter(part => part.length > 0);
    return {
      line,
      parts: parts.map(part => ({ 
        text: part, 
        isClickable: lineIndex === 0 || // pcf es clickeable
                    (lineIndex >= 2 && !part.match(/^\s+$/)), // resto de palabras clickeables excepto espacios
        canBlink: lineIndex >= 2 // Solo parpadean las líneas después de "* control data"
      }))
    };
  });

  // Efecto para el parpadeo
  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleWords(prev => {
        const next = new Set(prev);
        processedWords.forEach(line => {
          line.parts.forEach(part => {
            if (part.canBlink && part.text.trim() !== selectedWord) {
              if (Math.random() < 0.1) { // 10% probabilidad de cambiar
                if (next.has(part.text)) {
                  next.delete(part.text);
                } else {
                  next.add(part.text);
                }
              }
            }
          });
        });
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [selectedWord]);

  return (
    <div className={`space-y-1 font-mono ${className}`}>
      {processedWords.map((line, lineIndex) => (
        <div key={lineIndex} className="whitespace-pre flex flex-wrap items-center">
          {line.parts.map((part, partIndex) => {
            const isSelected = part.text.trim() === selectedWord;
            const isVisible = visibleWords.has(part.text) || !part.canBlink || isSelected;

            return (
              <motion.span
                key={`${lineIndex}-${partIndex}`}
                initial={{ opacity: 1 }}
                animate={{ 
                  opacity: isVisible ? 1 : 0.5,
                  scale: isVisible ? 1 : 0.98
                }}
                transition={{ duration: 0.2 }}
                className={`
                  transition-colors duration-200
                  ${part.isClickable ? 'cursor-pointer hover:text-teal-300' : ''}
                  ${isSelected ? 'text-teal-300' : 'text-[#C8C8C9]'}
                  ${isVisible ? 'brightness-125 text-shadow-glow' : ''}
                `}
                onClick={() => {
                  if (part.isClickable && onWordClick) {
                    const textToSelect = part.text.trim();
                    setSelectedWord(textToSelect);
                    onWordClick(textToSelect);
                  }
                }}
              >
                {part.text}
              </motion.span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Agregar estilos globales en tu archivo CSS global
// .text-shadow-glow {
//   text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
// } 