import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Sparkles } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      toast.success('Login successful!');
      onLogin(response.data.user, response.data.access_token);
    } catch (error) {
      console.error('Login failed:', error);
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a0b] via-[#12121a] to-[#1a1a2e] p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-4xl font-bold gradient-text mb-2">AuroraCraft</h1>
          <p className="text-gray-400">Agentic Minecraft Plugin Creator</p>
        </div>

        <div className="glass rounded-2xl p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2" data-testid="login-title">Welcome Back</h2>
            <p className="text-gray-400 text-sm">Login to continue building plugins</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@auroracraft.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-[#1a1a22] border-gray-700 text-white"
                data-testid="email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-[#1a1a22] border-gray-700 text-white"
                data-testid="password-input"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-3"
              data-testid="login-button"
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-gray-400">Don't have an account? </span>
            <Link to="/register" className="text-purple-400 hover:text-purple-300 font-medium">
              Register
            </Link>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              Demo: admin@auroracraft.dev / Admin123!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
