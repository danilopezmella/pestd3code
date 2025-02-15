import React, { useState } from 'react';

interface PcfReferenceProps {
  onWordClick: (word: string) => void;
}

export const PcfReference: React.FC<PcfReferenceProps> = ({ onWordClick }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Function to make words clickable
  const makeClickableWords = (line: string) => {
    // Split the line into words but keep spaces and special characters
    const parts = line.split(/(\s+)/);
    
    return parts.map((part, index) => {
      // Skip spaces and special characters
      if (part.trim() === '' || part.match(/^[*[\]]/)) {
        return <span key={index}>{part}</span>;
      }
      
      // Remove brackets for the click handler but keep them in display
      const cleanWord = part.replace(/[[\]]/g, '');
      
      return (
        <button
          key={index}
          onClick={() => onWordClick(cleanWord)}
          className="text-purple-400 hover:text-purple-300 transition-colors font-mono px-0.5"
        >
          {part}
        </button>
      );
    });
  };

  return (
    <div className="fixed top-24 right-4 w-[500px] bg-[#1e1e2f]/95 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl overflow-hidden">
      {/* Mac-style window header */}
      <div className="bg-[#2a2a3a] px-4 py-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/90" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/90" />
          <div className="w-3 h-3 rounded-full bg-green-500/90" />
        </div>
        <div className="text-gray-400 text-sm font-medium ml-2">pest_control_file.pst</div>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-2 text-sm text-gray-300 font-mono">
        <div className="text-gray-500"># PEST Control File Structure</div>
        <div className="text-gray-500"># ========================</div>
        <div>pcf</div>
        <div className="text-gray-500">* control data</div>
        <div>{makeClickableWords("RSTFLE PESTMODE")}</div>
        <div>{makeClickableWords("NPAR NOBS NPARGP NPRIOR NOBSGP [MAXCOMPDIM] [DERZEROLIM]")}</div>
        <div>{makeClickableWords("NTPLFLE NINSFLE PRECIS DPOINT [NUMCOM JACFILE MESSFILE] [OBSREREF]")}</div>
        <div>{makeClickableWords("RLAMBDA1 RLAMFAC PHIRATSUF PHIREDLAM NUMLAM [JACUPDATE] [LAMFORGIVE] [DERFORGIVE]")}</div>
        <div>{makeClickableWords("RELPARMAX FACPARMAX FACORIG [IBOUNDSTICK UPVECBEND] [ABSPARMAX]")}</div>
        <div>{makeClickableWords("PHIREDSWH [NOPTSWITCH] [SPLITSWH] [DOAUI] [DOSENREUSE] [BOUNDSCALE]")}</div>
        <div>{makeClickableWords("NOPTMAX PHIREDSTP NPHISTP NPHINORED RELPARSTP NRELPAR [PHISTOPTHRESH] [LASTRUN] [PHIABANDON]")}</div>
        <div>{makeClickableWords("ICOV ICOR IEIG [IRES] [JCOSAVE] [VERBOSEREC] [JCOSAVEITN] [REISAVEITN] [PARSAVEITN] [PARSAVERUN]")}</div>
      </div>
    </div>
  );
}; 