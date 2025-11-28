import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sparkles, Plus, LogOut, Settings, Folder, Clock, Shield } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Dashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    title: '',
    creation_type: '',
    target_software: '',
    project_source: 'blank',
    github_repo_url: ''
  });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await axios.get(`${API}/sessions`);
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(`${API}/sessions`, newSession);
      toast.success('Session created!');
      setCreateDialogOpen(false);
      navigate(`/session/${response.data.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create session');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0b] via-[#12121a] to-[#1a1a2e]">
      {/* Header */}
      <div className="glass border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-lg">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">AuroraCraft</h1>
                <p className="text-xs text-gray-400">Plugin Development Studio</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-4 py-2 glass rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm text-gray-300">{user.username}</span>
                <span className="text-xs text-gray-500">|</span>
                <span className="text-xs text-green-400">{user.token_balance.toFixed(0)} tokens</span>
              </div>

              {user.role === 'admin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/admin')}
                  className="text-purple-400 hover:text-purple-300"
                  data-testid="admin-panel-button"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="text-gray-400 hover:text-gray-300"
                data-testid="logout-button"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Your Projects</h2>
            <p className="text-gray-400">Create and manage Minecraft plugin projects</p>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                data-testid="create-session-button"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1a22] border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-white">Create New Project</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Set up a new Minecraft plugin project
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateSession} className="space-y-4 mt-4">
                {/* Project Name */}
                <div className="space-y-2">
                  <Label className="text-gray-300">Project Name</Label>
                  <Input
                    placeholder="My Awesome Plugin"
                    value={newSession.title}
                    onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                    required
                    className="bg-[#0f0f11] border-gray-700 text-white"
                    data-testid="project-name-input"
                  />
                </div>

                {/* Creation Type */}
                <div className="space-y-2">
                  <Label className="text-gray-300">Creation Type</Label>
                  <Select
                    value={newSession.creation_type}
                    onValueChange={(value) => setNewSession({ ...newSession, creation_type: value, target_software: value === 'minecraft_java_plugin' ? 'Paper' : '' })}
                    required
                  >
                    <SelectTrigger className="bg-[#0f0f11] border-gray-700 text-white">
                      <SelectValue placeholder="Select creation type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a22] border-gray-700">
                      <SelectItem value="minecraft_java_plugin">Minecraft Java Plugin [Available]</SelectItem>
                      <SelectItem value="minecraft_java_mod" disabled>Minecraft Java Mod [Coming Soon]</SelectItem>
                      <SelectItem value="minecraft_bedrock_mod" disabled>Minecraft Bedrock Mod [Coming Soon]</SelectItem>
                      <SelectItem value="discord_bot" disabled>Discord Bot [Coming Soon]</SelectItem>
                      <SelectItem value="web_app" disabled>Web APP [Coming Soon]</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Software - Only shown when Minecraft Java Plugin is selected */}
                {newSession.creation_type === 'minecraft_java_plugin' && (
                  <div className="space-y-2">
                    <Label className="text-gray-300">Software</Label>
                    <Select
                      value={newSession.target_software}
                      onValueChange={(value) => setNewSession({ ...newSession, target_software: value })}
                      required
                    >
                      <SelectTrigger className="bg-[#0f0f11] border-gray-700 text-white">
                        <SelectValue placeholder="Select software" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a22] border-gray-700">
                        <SelectItem value="Paper">Paper</SelectItem>
                        <SelectItem value="Spigot">Spigot</SelectItem>
                        <SelectItem value="Bukkit">Bukkit</SelectItem>
                        <SelectItem value="Purpur">Purpur</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Project Source */}
                <div className="space-y-2">
                  <Label className="text-gray-300">Project Source</Label>
                  <Select
                    value={newSession.project_source}
                    onValueChange={(value) => setNewSession({ ...newSession, project_source: value })}
                  >
                    <SelectTrigger className="bg-[#0f0f11] border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a22] border-gray-700">
                      <SelectItem value="blank">Create Blank</SelectItem>
                      <SelectItem value="upload">Upload Existing Project</SelectItem>
                      <SelectItem value="github">Clone from GitHub</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* GitHub URL - Only shown when github is selected */}
                {newSession.project_source === 'github' && (
                  <div className="space-y-2">
                    <Label className="text-gray-300">GitHub Repository URL</Label>
                    <Input
                      placeholder="https://github.com/username/repo"
                      value={newSession.github_repo_url}
                      onChange={(e) => setNewSession({ ...newSession, github_repo_url: e.target.value })}
                      required
                      className="bg-[#0f0f11] border-gray-700 text-white"
                      data-testid="github-url-input"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  data-testid="create-project-submit"
                >
                  Create Project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Sessions Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            <p className="text-gray-400 mt-4">Loading projects...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <Folder className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-400 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6">Create your first Minecraft plugin project to get started</p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => navigate(`/session/${session.id}`)}
                className="glass rounded-xl p-6 hover:border-purple-500/50 transition-all cursor-pointer group"
                data-testid={`session-card-${session.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                    <Folder className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="px-2 py-1 bg-green-500/20 rounded text-xs text-green-400">
                    {session.target_software}
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-white mb-2 truncate">{session.title}</h3>

                <div className="flex items-center text-xs text-gray-400 space-x-4">
                  <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {new Date(session.last_updated).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
