"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface User {
    id: string;
    username: string;
    email: string;
    tokenBalance: number;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<boolean>;
    register: (username: string, email: string, password: string) => Promise<boolean>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check for existing session
        const storedUser = localStorage.getItem("auroracraft_user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setIsLoading(false);
    }, []);

    const login = async (email: string, password: string): Promise<boolean> => {
        // Mock login - in production, call API
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (email && password.length >= 6) {
            const mockUser: User = {
                id: "user_" + Math.random().toString(36).substr(2, 9),
                username: email.split("@")[0],
                email,
                tokenBalance: 50000,
            };
            setUser(mockUser);
            localStorage.setItem("auroracraft_user", JSON.stringify(mockUser));
            return true;
        }
        return false;
    };

    const register = async (username: string, email: string, password: string): Promise<boolean> => {
        // Mock register - in production, call API
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (username && email && password.length >= 6) {
            const mockUser: User = {
                id: "user_" + Math.random().toString(36).substr(2, 9),
                username,
                email,
                tokenBalance: 100000,
            };
            setUser(mockUser);
            localStorage.setItem("auroracraft_user", JSON.stringify(mockUser));
            return true;
        }
        return false;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("auroracraft_user");
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
