import React, { useState, useEffect, useRef } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Link, 
  useNavigate,
  useLocation,
  useParams
} from 'react-router-dom';
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
  VideoOff,
  UserPlus,
  Users,
  Compass,
  Plus,
  Waves,
  ShieldCheck,
  Eye,
  ArrowRight,
  ChevronRight,
  Menu,
  Globe,
  Cpu,
  Server,
  Zap,
  Monitor,
  Hand,
  MessageSquare,
  Info,
  Copy,
  Check,
  Home
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

export function MessengerApp() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [channels, setChannels] = useState<Channel[]>([]);
  const [contacts, setContacts] = useState<UserData[]>([]);
  const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
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

    const handleOAuth = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        setLinkedAccounts(prev => [...prev, { provider: event.data.provider, provider_user_id: `simulated_${event.data.provider}_id` }]);
      }
    };
    window.addEventListener('message', handleOAuth);
    return () => window.removeEventListener('message', handleOAuth);
  }, []);

  const handleConnect = async (provider: string) => {
    if (!user) return;
    if (provider === 'email') {
      const email = prompt("Enter your email address:");
      if (email) {
        const res = await fetch('/api/contacts/add-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, email })
        });
        if (res.ok) setLinkedAccounts(prev => [...prev, { provider: 'email', provider_user_id: email }]);
      }
      return;
    }
    try {
      const res = await fetch(`/api/auth/url/${provider}?userId=${user.id}`);
      const { url } = await res.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      console.error('Connection error:', err);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !newUsername.trim()) return;
    setIsUpdatingProfile(true);
    try {
      const res = await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.id, 
          username: newUsername, 
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newUsername}` 
        })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem('razif_user', JSON.stringify(data));
        alert('Profile updated successfully!');
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error('Update error:', err);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleSync = async (provider: string) => {
    if (!user) return;
    setIsSyncing(provider);
    try {
      const res = await fetch('/api/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, provider })
      });
      if (res.ok) {
        // Refresh contacts
        const contactsRes = await fetch(`/api/contacts/${user.id}`);
        const contactsData = await contactsRes.json();
        setContacts(contactsData);
        alert(`Successfully synced ${provider} contacts!`);
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(null);
    }
  };

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
      
      fetch(`/api/contacts/${user.id}`)
        .then(res => res.json())
        .then(setContacts);
      
      fetch(`/api/users/nearby?userId=${user.id}`)
        .then(res => res.json())
        .then(setNearbyUsers);

      fetch(`/api/linked-accounts/${user.id}`)
        .then(res => res.json())
        .then(data => setLinkedAccounts(data));
    }
  }, [user]);

  useEffect(() => {
    if (searchQuery.length > 2 && user) {
      fetch(`/api/users/search?q=${searchQuery}&currentUserId=${user.id}`)
        .then(res => res.json())
        .then(setSearchResults);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, user]);

  const handleAddContact = async (contact: UserData) => {
    if (!user) return;
    const res = await fetch('/api/contacts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, contactId: contact.id })
    });
    if (res.ok) {
      setContacts(prev => [...prev, contact]);
      setShowAddUser(false);
      setSearchQuery('');
    }
  };

  const handleDeleteContact = async (e: React.MouseEvent, contactId: number) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm('Are you sure you want to remove this contact?')) return;
    
    const res = await fetch('/api/contacts/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, contactId })
    });
    if (res.ok) {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      if (activeChannel?.id === `dm_${[user.id, contactId].sort().join('_')}`) {
        setActiveChannel(channels[0]);
      }
    }
  };

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
    
    if (activeChannel.id === 'aisa' || inputValue.toLowerCase().startsWith('/ai')) {
      setIsTyping(true);
      try {
        const aiResponse = await chatWithGemini(inputValue);
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: activeChannel.id,
            sender_name: 'AISA (NASA DEF)',
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
        
        // Update user location on server
        await fetch('/api/users/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, lat: latitude, lng: longitude })
        });

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
            sender_name: 'AISA (NASA DEF)',
            sender_id: 0,
            content: content,
            is_ai: 1
          })
        });

        // Refresh nearby users
        fetch(`/api/users/nearby?userId=${user.id}`)
          .then(res => res.json())
          .then(setNearbyUsers);

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
      case 'User': return <User size={20} />;
      case 'Waves': return <Waves size={20} />;
      case 'ShieldCheck': return <ShieldCheck size={20} />;
      case 'Eye': return <Eye size={20} />;
      default: return <MessageCircle size={20} />;
    }
  };

  const startDM = (contact: UserData) => {
    setActiveChannel({
      id: `dm_${[user?.id, contact.id].sort().join('_')}`,
      name: contact.username,
      icon: 'User',
      type: 'messenger'
    });
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
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="text-black" size={24} />
            </div>
            <h1 className="hidden md:block font-bold text-xl tracking-tight">NASA DEF</h1>
          </div>
          <div className="flex gap-2">
            <a 
              href="https://nasadef.com.my/index.html"
              className="hidden md:flex p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 transition-all"
              title="NASA DEF Official Home"
            >
              <Home size={18} />
            </a>
            <button 
              onClick={() => navigate('/')}
              className="hidden md:flex p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 transition-all"
              title="App Dashboard"
            >
              <Globe size={18} />
            </button>
            <button 
              onClick={() => setShowAddUser(true)}
              className="hidden md:flex p-2 bg-white/5 hover:bg-white/10 rounded-lg text-emerald-500 transition-all"
            >
              <UserPlus size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-3 space-y-6 overflow-y-auto custom-scrollbar">
          {/* RMeet Button */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mb-2 hidden md:block">Meetings</div>
            <button
              onClick={() => navigate('/rmeet')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                location.pathname.startsWith('/rmeet')
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-inner' 
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Video size={20} />
              <span className="hidden md:block font-medium text-sm">RMeet</span>
            </button>
          </div>

          {/* Channels */}
          <div>
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

          {/* Contacts */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mb-2 hidden md:block">Contacts</div>
            {contacts.map(contact => (
              <div key={contact.id} className="group relative">
                <button
                  onClick={() => startDM(contact)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                    activeChannel?.id === `dm_${[user?.id, contact.id].sort().join('_')}`
                      ? 'bg-white/10 text-white shadow-inner' 
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <img src={contact.avatar} className="w-5 h-5 rounded-full" alt="" />
                  <span className="hidden md:block font-medium text-sm truncate flex-1 text-left">{contact.username}</span>
                </button>
                <button 
                  onClick={(e) => handleDeleteContact(e, contact.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500/50 hover:text-red-500 transition-all hidden md:block"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="hidden md:block text-[10px] text-white/20 px-3 italic">No contacts yet</p>
            )}
          </div>

          {/* Nearby Discovery */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mb-2 hidden md:block">Nearby Users</div>
            {nearbyUsers.map(nearby => (
              <div
                key={nearby.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-white/50 group"
              >
                <img src={nearby.avatar} className="w-5 h-5 rounded-full" alt="" />
                <span className="hidden md:block font-medium text-sm truncate flex-1">{nearby.username}</span>
                <button 
                  onClick={() => handleAddContact(nearby)}
                  className="hidden md:block opacity-0 group-hover:opacity-100 p-1 bg-emerald-500 text-black rounded transition-all"
                >
                  <Plus size={12} />
                </button>
              </div>
            ))}
            {nearbyUsers.length === 0 && (
              <p className="hidden md:block text-[10px] text-white/20 px-3 italic">No one nearby</p>
            )}
          </div>
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
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-white/50 hover:bg-white/5 hover:text-white transition-all"
          >
            <Settings size={20} />
            <span className="hidden md:block font-medium text-sm">Settings</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-red-500/50 hover:bg-red-500/10 hover:text-red-500 transition-all"
          >
            <LogOut size={20} />
            <span className="hidden md:block font-medium text-sm">Logout</span>
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

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl bg-[#151619] rounded-3xl p-8 border border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold">Settings & Accounts</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-lg transition-all"><X size={24} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold text-white/30 uppercase tracking-widest mb-4">Profile</h4>
                  <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <img src={user?.avatar} className="w-16 h-16 rounded-2xl" alt="" />
                      <div>
                        <p className="font-bold text-lg">{user?.username}</p>
                        <p className="text-white/40 text-sm">RAZIF User ID: {user?.id}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-white/30 uppercase tracking-widest">Change Username</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="New username..." 
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                        />
                        <button 
                          onClick={handleUpdateProfile}
                          disabled={isUpdatingProfile}
                          className="px-4 py-2 bg-emerald-500 text-black rounded-xl text-sm font-bold hover:bg-emerald-400 transition-all disabled:opacity-50"
                        >
                          {isUpdatingProfile ? <Loader2 className="animate-spin" size={18} /> : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white/30 uppercase tracking-widest mb-4">Linked Accounts</h4>
                  <div className="space-y-3">
                    {[
                      { id: 'telegram', name: 'Telegram', icon: <MessageCircle size={18} />, color: 'bg-blue-500' },
                      { id: 'whatsapp', name: 'WhatsApp', icon: <MessageCircle size={18} />, color: 'bg-emerald-500' },
                      { id: 'facebook', name: 'Messenger', icon: <Facebook size={18} />, color: 'bg-blue-600' },
                      { id: 'instagram', name: 'Instagram', icon: <Instagram size={18} />, color: 'bg-pink-600' },
                      { id: 'email', name: 'Email', icon: <Mail size={18} />, color: 'bg-slate-500' },
                    ].map(provider => (
                      <div key={provider.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${provider.color} rounded-lg flex items-center justify-center text-white`}>
                            {provider.icon}
                          </div>
                          <span className="font-medium">{provider.name}</span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {linkedAccounts.find(a => a.provider === provider.id) ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">Connected</span>
                              <button 
                                onClick={() => handleSync(provider.id)}
                                disabled={isSyncing === provider.id}
                                className="text-[10px] text-white/40 hover:text-white flex items-center gap-1 transition-all"
                              >
                                {isSyncing === provider.id ? <Loader2 className="animate-spin" size={10} /> : <Compass size={10} />}
                                Sync Contacts
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleConnect(provider.id)}
                              className="text-xs font-bold text-white/50 hover:text-white transition-all"
                            >
                              Connect
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-[#151619] rounded-3xl p-6 border border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Add New User</h3>
                <button onClick={() => setShowAddUser(false)} className="p-2 hover:bg-white/5 rounded-lg transition-all"><X size={20} /></button>
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input 
                  type="text" 
                  placeholder="Search by username..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500/50 transition-all"
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {searchResults.map(result => (
                  <div key={result.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <img src={result.avatar} className="w-10 h-10 rounded-lg" alt="" />
                      <span className="font-bold">{result.username}</span>
                    </div>
                    <button 
                      onClick={() => handleAddContact(result)}
                      className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-all"
                    >
                      <UserPlus size={18} />
                    </button>
                  </div>
                ))}
                {searchQuery.length > 2 && searchResults.length === 0 && (
                  <p className="text-center text-white/20 py-4 italic">No users found</p>
                )}
                {searchQuery.length <= 2 && (
                  <p className="text-center text-white/20 py-4 italic">Type at least 3 characters to search</p>
                )}
              </div>
            </motion.div>
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

function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-lg border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Zap size={20} className="text-black" />
          </div>
          <span className="text-xl font-bold tracking-tighter">NASA DEF</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
          <a href="https://nasadef.com.my/index.html" className="flex items-center gap-1 hover:text-white transition-colors">
            <Home size={16} /> Home
          </a>
          <a href="#about" className="hover:text-white transition-colors">About</a>
          <a href="#products" className="hover:text-white transition-colors">Products</a>
          <a href="#services" className="hover:text-white transition-colors">Services</a>
          <button onClick={() => navigate('/messenger')} className="px-5 py-2 bg-emerald-500 text-black rounded-full font-bold hover:bg-emerald-400 transition-all">
            Open Messenger
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-radial-gradient from-emerald-500/10 to-transparent blur-3xl -z-10" />
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-8xl font-bold leading-none tracking-tighter mb-6">
              Innovative <span className="text-emerald-500">Technology</span> for Your Business
            </h1>
            <p className="text-xl text-white/50 mb-8 max-w-lg">
              Nasa Def Sdn Bhd specializes in IoT solutions and AI services for agriculture and surveillance sectors.
            </p>
            <div className="flex gap-4">
              <button onClick={() => navigate('/messenger')} className="px-8 py-4 bg-emerald-500 text-black rounded-full font-bold text-lg hover:bg-emerald-400 transition-all flex items-center gap-2">
                Get Started <ArrowRight size={20} />
              </button>
              <button className="px-8 py-4 bg-white/5 border border-white/10 rounded-full font-bold text-lg hover:bg-white/10 transition-all">
                Learn More
              </button>
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square bg-emerald-500/20 rounded-3xl overflow-hidden border border-emerald-500/30">
              <img 
                src="https://picsum.photos/seed/iot/800/800" 
                alt="IoT Technology" 
                className="w-full h-full object-cover mix-blend-overlay"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-8 left-8 right-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                    <Bot size={24} className="text-black" />
                  </div>
                  <span className="font-bold text-xl text-white">AISA AI Agent</span>
                </div>
                <p className="text-white/60 text-sm">Powered by NASA DEF AI Services</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 border-y border-white/5 bg-white/2">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: 'Active Devices', value: '10k+' },
            { label: 'AI Requests/Day', value: '500k+' },
            { label: 'Farms Protected', value: '2k+' },
            { label: 'Uptime', value: '99.9%' }
          ].map((stat, i) => (
            <div key={i}>
              <div className="text-4xl font-bold text-emerald-500 mb-1">{stat.value}</div>
              <div className="text-sm text-white/40 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      <section id="products" className="py-32 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4">Our Products</h2>
          <p className="text-white/50 max-w-2xl mx-auto text-lg">
            Advanced IoT products designed specifically for farm security and surveillance.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: 'Farm Sense', desc: 'IoT Sensor Keselamatan Ladang', icon: <ShieldCheck size={32} /> },
            { name: 'FloodSense', desc: 'Smart Flood Early Warning System', icon: <Waves size={32} /> },
            { name: 'WildSec', desc: 'Pengawasan Hidupan Liar & Surveillance', icon: <Eye size={32} /> }
          ].map((product, i) => (
            <div key={i} className="p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                {product.icon}
              </div>
              <h3 className="text-2xl font-bold mb-2">{product.name}</h3>
              <p className="text-white/50 mb-6">{product.desc}</p>
              <button className="flex items-center gap-2 text-emerald-500 font-bold hover:gap-4 transition-all">
                View Details <ChevronRight size={20} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Zap size={20} className="text-black" />
              </div>
              <span className="text-xl font-bold tracking-tighter text-white">NASA DEF</span>
            </div>
            <p className="text-white/40 max-w-sm mb-8">
              Nasa Def Sdn Bhd is committed to delivering innovative and reliable technology to help customers optimize their operations.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"><Facebook size={20} /></a>
              <a href="#" className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"><Instagram size={20} /></a>
              <a href="#" className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"><Mail size={20} /></a>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-6">Company</h4>
            <ul className="space-y-4 text-white/40 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-6">Contact</h4>
            <ul className="space-y-4 text-white/40 text-sm">
              <li>info@nasadef.com.my</li>
              <li>+6017-4511455</li>
              <li>Kuala Lumpur, Malaysia</li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 text-center text-white/20 text-xs">
          &copy; 2026 NASA DEF SDN BHD. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function RMeet() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState([
    { id: 1, name: 'You', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=You', isLocal: true },
    { id: 2, name: 'AISA (NASA DEF)', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=AISA', isLocal: false },
    { id: 3, name: 'Engineer 1', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Eng1', isLocal: false },
  ]);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (err) {
        console.error("Camera error:", err);
      }
    }
    setupCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => track.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => track.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!roomId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                <Video size={24} className="text-black" />
              </div>
              <span className="text-2xl font-bold tracking-tighter">RMeet</span>
            </div>
            <h1 className="text-5xl font-bold mb-6 leading-tight">Premium video meetings. Now free for everyone.</h1>
            <p className="text-white/50 text-xl mb-10">We re-engineered the service we built for secure business meetings, RMeet, to make it free and available for all.</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => navigate(`/rmeet/${Math.random().toString(36).substring(7)}`)}
                className="px-8 py-4 bg-emerald-500 text-black rounded-lg font-bold text-lg hover:bg-emerald-400 transition-all flex items-center gap-2 justify-center"
              >
                <Video size={20} /> New Meeting
              </button>
              <div className="flex-1 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter a code or link"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 focus:outline-none focus:border-emerald-500 transition-all"
                />
                <button className="px-6 py-4 text-emerald-500 font-bold hover:bg-white/5 rounded-lg transition-all">Join</button>
              </div>
            </div>
            <div className="mt-12 pt-12 border-t border-white/5 flex flex-col gap-4">
              <a href="https://nasadef.com.my/index.html" className="text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-2 font-medium">
                <Home size={18} /> Go to Official Website
              </a>
              <button onClick={() => navigate('/')} className="text-white/40 hover:text-white transition-colors flex items-center gap-2">
                <ArrowRight className="rotate-180" size={18} /> Back to App Dashboard
              </button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="aspect-video bg-white/5 rounded-3xl border border-white/10 overflow-hidden relative group">
              <img src="https://picsum.photos/seed/meeting/800/450" className="w-full h-full object-cover opacity-50" alt="" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center animate-pulse">
                  <Play size={32} className="text-black ml-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#151619] text-white flex flex-col overflow-hidden">
      {/* Main View */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar">
        {participants.map(p => (
          <div key={p.id} className="relative aspect-video bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden group">
            {p.isLocal ? (
              <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline 
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
              />
            ) : (
              <img src={`https://picsum.photos/seed/user${p.id}/800/450`} className="w-full h-full object-cover opacity-80" alt="" />
            )}
            
            {(p.isLocal && isVideoOff) || (!p.isLocal && false) ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
                <img src={p.avatar} className="w-24 h-24 rounded-full border-4 border-white/10" alt="" />
              </div>
            ) : null}

            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 border border-white/10">
              {p.name} {p.isLocal && '(You)'}
            </div>

            {!p.isLocal && (
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10">
                  <MoreVertical size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="h-24 bg-[#0a0a0a] border-t border-white/5 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="hidden md:block">
            <div className="text-sm font-medium">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} | {roomId}</div>
          </div>
          <button 
            onClick={copyLink}
            className="p-2 hover:bg-white/5 rounded-full transition-all text-white/60 hover:text-white"
            title="Copy meeting link"
          >
            {copied ? <Check size={20} className="text-emerald-500" /> : <Copy size={20} />}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
              isMuted ? 'bg-red-500 border-red-500 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button 
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
              isVideoOff ? 'bg-red-500 border-red-500 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
            <Hand size={20} />
          </button>
          <button 
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
              isScreenSharing ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <Monitor size={20} />
          </button>
          <button 
            onClick={() => navigate('/messenger')}
            className="px-6 h-12 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-all flex items-center gap-2"
          >
            <Phone size={20} className="rotate-[135deg]" /> End Call
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-3 hover:bg-white/5 rounded-full transition-all text-white/60 hover:text-white">
            <Info size={20} />
          </button>
          <button className="p-3 hover:bg-white/5 rounded-full transition-all text-white/60 hover:text-white">
            <Users size={20} />
          </button>
          <button className="p-3 hover:bg-white/5 rounded-full transition-all text-white/60 hover:text-white">
            <MessageSquare size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/messenger" element={<MessengerApp />} />
        <Route path="/rmeet" element={<RMeet />} />
        <Route path="/rmeet/:roomId" element={<RMeet />} />
      </Routes>
    </BrowserRouter>
  );
}
