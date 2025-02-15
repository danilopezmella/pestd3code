import { useState, useEffect } from 'react';

interface Message {
  text: string;
  isBot: boolean;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  isLoading: boolean;
  isThinking: boolean;
  isRenaming: boolean;
  renamingChatId: string | null;
  newChatName: string;
}

export const useChat = () => {
  // Base state
  const [state, setState] = useState<ChatState>({
    chats: [],
    currentChatId: null,
    isLoading: false,
    isThinking: false,
    isRenaming: false,
    renamingChatId: null,
    newChatName: ''
  });

  // Load initial state from sessionStorage
  useEffect(() => {
    const savedChats = sessionStorage.getItem('chats');
    const savedCurrentChatId = sessionStorage.getItem('currentChatId');
    
    if (savedChats) {
      setState(prev => ({
        ...prev,
        chats: JSON.parse(savedChats)
      }));
    }
    
    if (savedCurrentChatId) {
      setState(prev => ({
        ...prev,
        currentChatId: savedCurrentChatId
      }));
    }
  }, []);

  // Atomic actions
  const createChat = (title: string = 'New Chat') => {
    const newChat: Chat = {
      id: new Date().getTime().toString(),
      title,
      messages: []
    };

    setState(prev => {
      const newState = {
        ...prev,
        chats: [...prev.chats, newChat],
        currentChatId: newChat.id
      };
      
      // Sync with sessionStorage
      sessionStorage.setItem('chats', JSON.stringify(newState.chats));
      sessionStorage.setItem('currentChatId', newState.currentChatId);
      
      return newState;
    });

    return newChat.id;
  };

  const addMessage = (chatId: string, message: Message, appendToLast: boolean = false) => {
    setState(prev => {
      const newState = {
        ...prev,
        chats: prev.chats.map(chat => {
          if (chat.id !== chatId) return chat;
  
          const updatedMessages = [...chat.messages];
  
          if (appendToLast && updatedMessages.length > 0 && updatedMessages[updatedMessages.length - 1].isBot) {
            // 🔥 Si `appendToLast` es `true`, actualiza el último mensaje del bot
            updatedMessages[updatedMessages.length - 1].text += message.text;
          } else {
            // 🆕 Si no, añade un nuevo mensaje
            updatedMessages.push(message);
          }
  
          return { ...chat, messages: updatedMessages };
        })
      };
  
      // Sync con sessionStorage
      sessionStorage.setItem("chats", JSON.stringify(newState.chats));
  
      return newState;
    });
  };
  

  const setLoadingState = (loading: boolean, thinking: boolean) => {
    setState(prev => ({
      ...prev,
      isLoading: loading,
      isThinking: thinking
    }));
  };

  const renameChat = (chatId: string, newName: string) => {
    if (!newName.trim()) return;

    setState(prev => {
      const newState = {
        ...prev,
        chats: prev.chats.map(chat => 
          chat.id === chatId
            ? { ...chat, title: newName.trim() }
            : chat
        ),
        isRenaming: false,
        renamingChatId: null,
        newChatName: ''
      };

      // Sync with sessionStorage
      sessionStorage.setItem('chats', JSON.stringify(newState.chats));
      
      return newState;
    });
  };

  const deleteChat = (chatId: string) => {
    setState(prev => {
      const newState = {
        ...prev,
        chats: prev.chats.filter(chat => chat.id !== chatId)
      };

      if (prev.currentChatId === chatId) {
        newState.currentChatId = null;
        sessionStorage.removeItem('currentChatId');
      }

      // Sync with sessionStorage
      sessionStorage.setItem('chats', JSON.stringify(newState.chats));
      
      return newState;
    });
  };

  const startRenaming = (chatId: string) => {
    setState(prev => ({
      ...prev,
      isRenaming: true,
      renamingChatId: chatId,
      newChatName: prev.chats.find(chat => chat.id === chatId)?.title || ''
    }));
  };

  const cancelRenaming = () => {
    setState(prev => ({
      ...prev,
      isRenaming: false,
      renamingChatId: null,
      newChatName: ''
    }));
  };

  const setNewChatName = (name: string) => {
    setState(prev => ({
      ...prev,
      newChatName: name
    }));
  };

  const getCurrentChat = () => {
    return state.chats.find(chat => chat.id === state.currentChatId);
  };

  return {
    // State
    chats: state.chats,
    currentChatId: state.currentChatId,
    isLoading: state.isLoading,
    isThinking: state.isThinking,
    isRenaming: state.isRenaming,
    renamingChatId: state.renamingChatId,
    newChatName: state.newChatName,
    currentChat: getCurrentChat(),
    
    // Actions
    createChat,
    addMessage,
    setLoadingState,
    renameChat,
    deleteChat,
    startRenaming,
    cancelRenaming,
    setNewChatName,
    
    // State actions
    setState
  };
}; 