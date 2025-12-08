"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthProvider, useAuth } from "@/context/AuthContext";

function RegisterForm() {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const router = useRouter();

    const validate = () => {
        const newErrors: Record<string, string> = {};

        if (username.length < 3) {
            newErrors.username = "Username must be at least 3 characters";
        }
        if (!email.includes("@")) {
            newErrors.email = "Please enter a valid email";
        }
        if (password.length < 6) {
            newErrors.password = "Password must be at least 6 characters";
        }
        if (password !== confirmPassword) {
            newErrors.confirmPassword = "Passwords do not match";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validate()) return;

        setLoading(true);
        try {
            const success = await register(username, email, password);
            if (success) {
                router.push("/dashboard");
            } else {
                setErrors({ form: "Registration failed. Please try again." });
            }
        } catch {
            setErrors({ form: "Something went wrong. Please try again." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#050508] relative overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px]" />
            </div>

            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center gap-3 mb-6">
                        <Logo className="w-10 h-10" />
                        <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            AuroraCraft
                        </span>
                    </Link>
                    <h1 className="text-3xl font-bold text-white mb-2">Create account</h1>
                    <p className="text-gray-400">Start building amazing projects</p>
                </div>

                {/* Form */}
                <form
                    onSubmit={handleSubmit}
                    className="bg-[#16161f] border border-white/5 rounded-2xl p-8"
                >
                    {errors.form && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            {errors.form}
                        </div>
                    )}

                    <div className="space-y-5">
                        <Input
                            label="Username"
                            type="text"
                            placeholder="johndoe"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            error={errors.username}
                            required
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            }
                        />

                        <Input
                            label="Email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            error={errors.email}
                            required
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                            }
                        />

                        <Input
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            error={errors.password}
                            required
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            }
                        />

                        <Input
                            label="Confirm Password"
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            error={errors.confirmPassword}
                            required
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            }
                        />

                        <p className="text-xs text-gray-500">
                            By creating an account, you agree to our{" "}
                            <Link href="/terms" className="text-purple-400 hover:underline">
                                Terms of Service
                            </Link>{" "}
                            and{" "}
                            <Link href="/privacy" className="text-purple-400 hover:underline">
                                Privacy Policy
                            </Link>
                        </p>

                        <Button type="submit" variant="primary" loading={loading} className="w-full">
                            Create Account
                        </Button>
                    </div>
                </form>

                {/* Login Link */}
                <p className="text-center mt-6 text-gray-400">
                    Already have an account?{" "}
                    <Link href="/login" className="text-purple-400 hover:text-purple-300 font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <AuthProvider>
            <RegisterForm />
        </AuthProvider>
    );
}
