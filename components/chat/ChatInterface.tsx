'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AssessmentResult } from '../../types/assessment-results';
import { ChatMessage, ChatConversation, startChatConversation, sendChatMessage, getChatConversation } from '../../services/chat-api';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { Card } from '../ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';

interface ChatInterfaceProps {
  assessmentResult: AssessmentResult;
  onBack: () => void;
}

export default function ChatInterface({ assessmentResult, onBack }: ChatInterfaceProps) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingMessage, setTypingMessage] = useState<ChatMessage | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingMessage]);

  // Initialize chat conversation
  useEffect(() => {
    initializeChat();
  }, [assessmentResult.id]);

  const initializeChat = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to get existing conversation first
      let existingConversation = await getChatConversation(assessmentResult.id);

      if (existingConversation) {
        setConversation(existingConversation);
        // Ensure messages is always an array
        setMessages(Array.isArray(existingConversation.messages) ? existingConversation.messages : []);
      } else {
        // Start new conversation
        const newConversation = await startChatConversation(assessmentResult.id, assessmentResult);
        setConversation(newConversation);
        // Ensure messages is always an array
        setMessages(Array.isArray(newConversation.messages) ? newConversation.messages : []);
      }
    } catch (err) {
      console.error('Failed to initialize chat:', err);
      setError('Gagal memulai percakapan. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (messageContent: string) => {
    if (!conversation || isSending) return;

    try {
      setIsSending(true);
      setError(null);

      // Add user message immediately
      const userMessage: ChatMessage = {
        id: 'temp-user-' + Date.now(),
        role: 'user',
        content: messageContent,
        timestamp: new Date().toISOString(),
        resultId: assessmentResult.id
      };

      setMessages(prev => [...prev, userMessage]);

      // Show typing indicator
      const typingMsg: ChatMessage = {
        id: 'typing',
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        resultId: assessmentResult.id
      };
      setTypingMessage(typingMsg);

      // Send message to API
      const aiResponse = await sendChatMessage(
        conversation.id,
        assessmentResult.id,
        messageContent
      );

      // Remove typing indicator and add AI response
      setTypingMessage(null);
      setMessages(prev => {
        // Remove the temporary user message and add both final messages
        const withoutTemp = prev.filter(msg => msg.id !== userMessage.id);
        return [...withoutTemp, 
          { ...userMessage, id: 'user-' + Date.now() }, 
          aiResponse
        ];
      });

    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Gagal mengirim pesan. Silakan coba lagi.');
      setTypingMessage(null);
      
      // Remove the temporary user message on error
      setMessages(prev => prev.filter(msg => msg.id !== 'temp-user-' + Date.now()));
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Memulai percakapan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ChatHeader assessmentResult={assessmentResult} onBack={onBack} />

      {/* Error Alert */}
      {error && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Messages Container */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        <div className="max-w-4xl mx-auto">
          {/* Messages */}
          {messages && messages.length > 0 ? (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
              <p>Belum ada pesan. Mulai percakapan dengan mengirim pesan!</p>
            </div>
          )}

          {/* Typing Indicator */}
          {typingMessage && (
            <MessageBubble message={typingMessage} isTyping={true} />
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200">
        <div className="max-w-4xl mx-auto">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isSending}
            placeholder={isSending ? "Mengirim pesan..." : "Tanyakan tentang hasil assessment Anda..."}
          />
        </div>
      </div>
    </div>
  );
}
