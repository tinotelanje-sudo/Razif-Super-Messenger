import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  MessageCircle, 
  Facebook, 
  Instagram, 
  Mail, 
  Bot, 
  Settings, 
  Search, 
  MoreVertical, 
  Paperclip, 
  Mic, 
  Image as ImageIcon,
  MapPin,
  Video,
  Volume2,
  Loader2,
  Play,
  Key,
  LogOut,
  User,
  Lock,
  Phone,
  X,
  Maximize2,
  MicOff,
  VideoOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Channel, Message } from './types';
import { useSocket } from './hooks/useSocket';
import { chatWithGemini, generateImage, textToSpeech, generateVideo, imageToVideo, getNearbyPlaces, transcribeAudio } from './services/geminiService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface UserData {
  id: number;
  username: string;
  avatar: string;
}

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { socket, isConnected } = useSocket(activeChannel?.id || null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
    
    const savedUser = localStorage.getItem('razif_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem('razif_user', JSON.stringify(data));
      } else {
        setAuthError(data.error);
      }
    } catch (err) {
      setAuthError('Connection failed');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('razif_user');
  };

  useEffect(() => {
    if (user) {
      fetch('/api/channels')
        .then(res => res.json())
        .then(data => {
          setChannels(data);
          if (data.length > 0) setActiveChannel(data[0]);
        });
    }
  }, [user]);

  useEffect(() => {
    if (activeChannel && user) {
      fetch(`/api/messages/${activeChannel.id}`)
        .then(res => res.json())
        .then(setMessages);
    }
  }, [activeChannel, user]);

  useEffect(() => {
    if (socket && user) {
      const handleMessage = (msg: Message) => {
        if (msg.channel === activeChannel?.id) {
          setMessages(prev => [...prev, msg]);
        }
      };
      socket.on('message', handleMessage);
      return () => {
        socket.off('message', handleMessage);
      };
    }
  }, [socket, activeChannel, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !activeChannel || !user) return;

    const userMsg = {
      channel: activeChannel.id,
      sender_name: user.username,
      sender_id: user.id,
      content: inputValue,
      is_ai: 0
    };

    setInputValue('');
    
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userMsg)
    });
    
    if (activeChannel.id === 'ai' || inputValue.toLowerCase().startsWith('/ai')) {
      setIsTyping(true);
      try {
        const aiResponse = await chatWithGemini(inputValue);
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: activeChannel.id,
            sender_name: 'RAZIF AI',
            sender_id: 0,
            content: aiResponse,
            is_ai: 1
          })
        });
      } catch (error) {
        console.error('AI Error:', error);
      } finally {
        setIsTyping(false);
      }
    }
  };

  const handleLocation = async () => {
    if (!activeChannel || !user) return;
    setIsTyping(true);
    try {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        const result = await getNearbyPlaces("What are some good places around here?", { lat: latitude, lng: longitude });
        
        let content = result.text;
        if (result.places.length > 0) {
          content += "\n\n**Sources:**\n" + result.places.map((p: any) => `- [${p.maps.title}](${p.maps.uri})`).join("\n");
        }

        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: activeChannel.id,
            sender_name: 'RAZIF AI',
            sender_id: 0,
            content: content,
            is_ai: 1
          })
        });
        setIsTyping(false);
      }, () => {
        alert("Location access denied");
        setIsTyping(false);
      });
    } catch (err) {
      setIsTyping(false);
    }
  };

  const handleTranscription = async () => {
    // Simulated transcription for demo purposes as real mic capture requires complex setup
    const mockAudio = "SGVsbG8gd29ybGQ="; // base64 placeholder
    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(mockAudio);
      setInputValue(text);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateImage = async () => {
    const promptText = window.prompt('Enter image description:');
    if (!promptText) return;

    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateImage(promptText, "1K");
      if (imageUrl && activeChannel && user) {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: activeChannel.id,
            sender_name: 'RAZIF AI',
            sender_id: 0,
            content: `Generated Image: ![image](${imageUrl})`,
            is_ai: 1
          })
        });
      }
    } catch (error) {
      console.error('Image Gen Error:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!hasApiKey && window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }

    const promptText = window.prompt('Enter video description:');
    if (!promptText) return;

    setIsGeneratingVideo(true);
    try {
      const videoUrl = await generateVideo(promptText);
      if (videoUrl && activeChannel && user) {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: activeChannel.id,
            sender_name: 'RAZIF AI',
            sender_id: 0,
            content: `Generated Video: [video](${videoUrl})`,
            is_ai: 1
          })
        });
      }
    } catch (error) {
      console.error('Video Gen Error:', error);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleImageToVideo = async (imageUri: string) => {
    if (!hasApiKey && window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }

    const promptText = window.prompt('Enter animation description (optional):', 'Animate this image realistically');
    if (promptText === null) return;

    setIsGeneratingVideo(true);
    try {
      const videoUrl = await imageToVideo(imageUri, promptText);
      if (videoUrl && activeChannel && user) {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: activeChannel.id,
            sender_name: 'RAZIF AI',
            sender_id: 0,
            content: `Animated Video: [video](${videoUrl})`,
            is_ai: 1
          })
        });
      }
    } catch (error) {
      console.error('Image to Video Error:', error);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleTTS = async (text: string) => {
    try {
      const base64Audio = await textToSpeech(text);
      if (base64Audio) {
        const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
        audio.play();
      }
    } catch (error) {
      console.error('TTS Error:', error);
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Send': return <Send size={20} />;
      case 'MessageCircle': return <MessageCircle size={20} />;
      case 'Facebook': return <Facebook size={20} />;
      case 'Instagram': return <Instagram size={20} />;
      case 'Mail': return <Mail size={20} />;
      case 'Bot': return <Bot size={20} />;
      default: return <MessageCircle size={20} />;
    }
  };

  if (!user) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#151619] rounded-3xl p-8 border border-white/5 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
              <Bot className="text-black" size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">RAZIF Messenger</h1>
            <p className="text-white/40 text-sm mt-1">The future of communication</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="text" 
                placeholder="Username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500/50 transition-all"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500/50 transition-all"
                required
              />
            </div>
            {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
            <button 
              type="submit"
              className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              {authMode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-white/40 text-sm hover:text-white transition-colors"
            >
              {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Log In"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-20 md:w-64 bg-[#151619] border-r border-white/5 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Bot className="text-black" size={24} />
          </div>
          <h1 className="hidden md:block font-bold text-xl tracking-tight">RAZIF</h1>
        </div>

        <div className="flex-1 px-3 space-y-2 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mb-2 hidden md:block">Channels</div>
          {channels.map(channel => (
            <button
              key={channel.id}
              onClick={() => setActiveChannel(channel)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                activeChannel?.id === channel.id 
                  ? 'bg-white/10 text-white shadow-inner' 
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className={`${activeChannel?.id === channel.id ? 'text-emerald-400' : ''}`}>
                {getIcon(channel.icon)}
              </div>
              <span className="hidden md:block font-medium text-sm">{channel.name}</span>
              {activeChannel?.id === channel.id && (
                <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 bg-emerald-500 rounded-full hidden md:block" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl mb-4 hidden md:flex">
            <img src={user.avatar} className="w-8 h-8 rounded-lg" alt="Avatar" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user.username}</p>
              <p className="text-[10px] text-emerald-500">Online</p>
            </div>
            <button onClick={handleLogout} className="text-white/20 hover:text-red-500 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
          <button className="w-full flex items-center gap-3 p-3 text-white/50 hover:text-white transition-colors">
            <Settings size={20} />
            <span className="hidden md:block text-sm">Settings</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-20 border-bottom border-white/5 flex items-center justify-between px-8 bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/5 rounded-lg">
              {activeChannel && getIcon(activeChannel.icon)}
            </div>
            <div>
              <h2 className="font-semibold text-lg">{activeChannel?.name || 'Select a channel'}</h2>
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                {isConnected ? 'Connected' : 'Connecting...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-white/50">
            <Search size={20} className="cursor-pointer hover:text-white transition-colors" />
            <Phone size={20} onClick={() => setShowCall(true)} className="cursor-pointer hover:text-white transition-colors" />
            <MoreVertical size={20} className="cursor-pointer hover:text-white transition-colors" />
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] group relative ${msg.sender_id === user.id ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-2 mb-1 px-1 ${msg.sender_id === user.id ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{msg.sender_name}</span>
                    <span className="text-[10px] text-white/20">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.sender_id === user.id 
                      ? 'bg-emerald-600 text-white rounded-tr-none' 
                      : msg.is_ai 
                        ? 'bg-white/10 text-white border border-white/10 rounded-tl-none'
                        : 'bg-[#1a1b1e] text-white/90 rounded-tl-none'
                  }`}>
                    {msg.content.includes('![image]') ? (
                      <div className="space-y-3">
                        <div className="relative group/img">
                          <img 
                            src={msg.content.match(/\((.*?)\)/)?.[1]} 
                            alt="Generated" 
                            className="rounded-lg max-w-full border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                          <button 
                            onClick={() => handleImageToVideo(msg.content.match(/\((.*?)\)/)?.[1] || '')}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg"
                          >
                            <Video size={24} className="text-white" />
                            <span className="text-white font-bold text-xs uppercase">Animate to Video</span>
                          </button>
                        </div>
                        <p className="text-[10px] opacity-50 italic">Generated by RAZIF AI</p>
                      </div>
                    ) : msg.content.includes('[video]') ? (
                      <div className="space-y-3">
                        <video 
                          src={msg.content.match(/\((.*?)\)/)?.[1]} 
                          controls 
                          className="rounded-lg max-w-full border border-white/10 aspect-video"
                        />
                        <p className="text-[10px] opacity-50 italic">Generated by RAZIF AI (Veo)</p>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                  {msg.is_ai === 1 && !msg.content.includes('[video]') && !msg.content.includes('![image]') && (
                    <button 
                      onClick={() => handleTTS(msg.content)}
                      className="absolute -right-8 top-1/2 -translate-y-1/2 p-2 text-white/20 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Volume2 size={16} />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {(isTyping || isGeneratingImage || isGeneratingVideo || isTranscribing) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="bg-white/5 p-4 rounded-2xl flex flex-col gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                  {isGeneratingVideo ? 'RAZIF is generating video (Veo)...' : isGeneratingImage ? 'RAZIF is creating image...' : isTranscribing ? 'Transcribing audio...' : 'RAZIF is thinking...'}
                </span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-[#0a0a0a]">
          <form 
            onSubmit={handleSendMessage}
            className="max-w-4xl mx-auto relative group"
          >
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3 text-white/30">
              <button type="button" className="hover:text-white transition-colors"><Paperclip size={20} /></button>
              <button 
                type="button" 
                onClick={handleGenerateImage}
                title="Generate Image"
                className={`hover:text-white transition-colors ${isGeneratingImage ? 'animate-spin text-emerald-500' : ''}`}
              >
                {isGeneratingImage ? <Loader2 size={20} /> : <ImageIcon size={20} />}
              </button>
              <button 
                type="button" 
                onClick={handleGenerateVideo}
                title="Generate Video (Veo)"
                className={`hover:text-white transition-colors ${isGeneratingVideo ? 'animate-spin text-emerald-500' : ''}`}
              >
                {isGeneratingVideo ? <Loader2 size={20} /> : <Video size={20} />}
              </button>
            </div>
            
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={activeChannel?.id === 'ai' ? "Ask RAZIF anything..." : "Type a message..."}
              className="w-full bg-[#151619] border border-white/5 rounded-2xl py-4 pl-32 pr-24 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm"
            />

            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <button 
                type="button" 
                onClick={handleTranscription}
                className={`p-2 text-white/30 hover:text-white transition-colors ${isTranscribing ? 'animate-pulse text-emerald-500' : ''}`}
              >
                <Mic size={20} />
              </button>
              <button 
                type="submit"
                disabled={!inputValue.trim()}
                className="p-2 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
          <div className="max-w-4xl mx-auto mt-3 flex justify-between px-2">
            <div className="flex gap-4">
              <button 
                onClick={handleLocation}
                className="text-[10px] uppercase font-bold tracking-widest text-white/20 hover:text-white/50 flex items-center gap-1"
              >
                <MapPin size={10} /> Location
              </button>
              <button 
                onClick={() => setShowCall(true)}
                className="text-[10px] uppercase font-bold tracking-widest text-white/20 hover:text-white/50 flex items-center gap-1"
              >
                <Video size={10} /> Video Call
              </button>
            </div>
            <p className="text-[10px] text-white/10 italic">Press Enter to send</p>
          </div>
        </div>
      </div>

      {/* Call UI Simulation */}
      <AnimatePresence>
        {showCall && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col"
          >
            <div className="flex-1 flex flex-col items-center justify-center p-12">
              <div className="relative">
                <div className="w-48 h-48 bg-emerald-500/20 rounded-full flex items-center justify-center animate-pulse">
                  <div className="w-40 h-40 bg-emerald-500/40 rounded-full flex items-center justify-center">
                    <img src={user.avatar} className="w-32 h-32 rounded-full border-4 border-emerald-500 shadow-2xl" alt="Avatar" />
                  </div>
                </div>
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Calling...</div>
              </div>
              <h3 className="text-3xl font-bold mt-12">{activeChannel?.name}</h3>
              <p className="text-white/40 mt-2">Connecting to secure server...</p>
            </div>

            <div className="h-48 bg-white/5 border-t border-white/5 flex items-center justify-center gap-8">
              <button className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"><MicOff size={24} /></button>
              <button className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"><VideoOff size={24} /></button>
              <button onClick={() => setShowCall(false)} className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"><X size={32} /></button>
              <button className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"><Maximize2 size={24} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
