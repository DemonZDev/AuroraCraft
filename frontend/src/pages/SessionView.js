import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Sparkles, Home, Code, Hammer, MessageSquare, Play, File as FileIcon } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function SessionView({ user, onLogout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  useEffect(() => {
    loadSession();
    loadFiles();
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions/${sessionId}`);
      setSession(response.data);
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load session');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      const response = await axios.get(`${API}/sessions/${sessionId}/files`);
      setFiles(response.data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const loadFileContent = async (path) => {
    try {
      const response = await axios.get(`${API}/sessions/${sessionId}/files/${path}`);
      setFileContent(response.data.content);
      setSelectedFile(path);
    } catch (error) {
      console.error('Failed to load file:', error);
      toast.error('Failed to load file');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = { role: 'user', content: inputMessage, timestamp: new Date() };
    setChatMessages([...chatMessages, userMessage]);
    setInputMessage('');

    // This would call the LLM API
    toast.info('LLM integration coming soon');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b]">
        <div className="text-white text-xl">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#0a0a0b] via-[#12121a] to-[#1a1a2e]">
      {/* Header */}
      <div className="glass border-b border-gray-800">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-gray-300"
              data-testid="home-button"
            >
              <Home className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-white">{session?.title}</h1>
              <p className="text-xs text-gray-400">{session?.target_software} {session?.target_version}</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="px-3 py-1 glass rounded-lg text-xs text-green-400">
              {user.token_balance.toFixed(0)} tokens
            </div>
            <Button
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              data-testid="compile-button"
            >
              <Hammer className="w-4 h-4 mr-2" />
              Compile
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - File Tree */}
        <div className="w-64 glass border-r border-gray-800 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">FILES</h3>
            {files.length === 0 ? (
              <p className="text-xs text-gray-500">No files yet</p>
            ) : (
              <div className="space-y-1">
                {files.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => loadFileContent(file.path)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      selectedFile === file.path
                        ? 'bg-purple-600/20 text-purple-400'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                    data-testid={`file-item-${file.path}`}
                  >
                    <FileIcon className="w-4 h-4" />
                    <span className="text-sm truncate">{file.path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center - Chat/Code View */}
        <div className="flex-1 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="glass border-b border-gray-800 rounded-none justify-start px-6">
              <TabsTrigger value="chat" className="data-[state=active]:text-purple-400">
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="code" className="data-[state=active]:text-purple-400">
                <Code className="w-4 h-4 mr-2" />
                Code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col m-0 p-6">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Sparkles className="w-16 h-16 text-purple-400 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Start Building</h3>
                    <p className="text-gray-400 max-w-md">
                      Describe your Minecraft plugin and I'll help you build it with AI-powered code generation
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                            : 'glass text-gray-200'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendMessage} className="flex space-x-4">
                <input
                  type="text"
                  placeholder="Describe your plugin idea..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 px-4 py-3 bg-[#1a1a22] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  data-testid="chat-input"
                />
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-6"
                  data-testid="send-button"
                >
                  <Play className="w-4 h-4" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="code" className="flex-1 m-0">
              {selectedFile ? (
                <Editor
                  height="100%"
                  defaultLanguage="java"
                  value={fileContent}
                  onChange={(value) => setFileContent(value || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    readOnly: false
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400">Select a file to edit</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default SessionView;
