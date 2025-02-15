import { useState } from "react";
import { ChatTest } from "../components/ChatTest";
import { LandingPage } from "../components/LandingPage";

export default function Index() {
  const [showChat, setShowChat] = useState(false);

  return (
    <div className="min-h-screen bg-[#1e2330] text-white">
      {showChat ? (
        <ChatTest />
      ) : (
        <LandingPage onStartChat={() => setShowChat(true)} />
      )}
    </div>
  );
}