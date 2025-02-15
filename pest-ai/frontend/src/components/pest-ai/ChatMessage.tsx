import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: string;
  isBot: boolean;
}

export function ChatMessage({ message, isBot }: ChatMessageProps) {
  return (
    <div className={cn(
      "flex mb-4 px-4 md:px-8",
      isBot ? "justify-start" : "justify-end"
    )}>
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 max-w-[400px]",
          isBot ? "bg-[#374151]" : "bg-purple-500/20",
          "text-white"
        )}
      >
        <p className="text-[14px] leading-relaxed">{message}</p>
      </div>
    </div>
  );  
}