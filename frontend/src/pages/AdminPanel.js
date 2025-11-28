import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Shield, Home, Plus, Server, Brain } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AdminPanel({ user, onLogout }) {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProviders();
    loadModels();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await axios.get(`${API}/admin/providers`);
      setProviders(response.data);
    } catch (error) {
      console.error('Failed to load providers:', error);
      toast.error('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const response = await axios.get(`${API}/admin/models`);
      setModels(response.data);
    } catch (error) {
      console.error('Failed to load models:', error);
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
                <Shield className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">Admin Panel</h1>
                <p className="text-xs text-gray-400">Manage Providers & Models</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-gray-300"
              data-testid="back-to-dashboard"
            >
              <Home className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="providers" className="space-y-6">
          <TabsList className="glass">
            <TabsTrigger value="providers">
              <Server className="w-4 h-4 mr-2" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="models">
              <Brain className="w-4 h-4 mr-2" />
              Models
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">LLM Providers</h2>
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                <Plus className="w-4 h-4 mr-2" />
                Add Provider
              </Button>
            </div>

            {loading ? (
              <p className="text-gray-400">Loading...</p>
            ) : (
              <div className="grid gap-4">
                {providers.map((provider) => (
                  <div key={provider.id} className="glass rounded-xl p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{provider.display_name}</h3>
                        <p className="text-sm text-gray-400 mt-1">{provider.base_url}</p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            provider.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {provider.enabled ? 'Active' : 'Disabled'}
                          </span>
                          <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
                            {provider.auth_type}
                          </span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="text-gray-300">
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="models" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Available Models</h2>
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                <Plus className="w-4 h-4 mr-2" />
                Add Model
              </Button>
            </div>

            <div className="grid gap-4">
              {models.map((model) => (
                <div key={model.id} className="glass rounded-xl p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{model.display_name}</h3>
                      <p className="text-sm text-gray-400 mt-1">{model.model_id}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          model.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {model.enabled ? 'Active' : 'Disabled'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                          ${model.per_char_cost.toFixed(9)}/char
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-gray-300">
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default AdminPanel;
