'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SigninPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            // Redirect to home
            router.push('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    return (
        <div className="min-h-screen flex flex-col justify-center items-center bg-neutral-950 text-neutral-200 p-4">
            <div className="w-full max-w-md bg-neutral-900 duration-100 rounded-2xl border border-neutral-800 p-8 shadow-xl">
                <h1 className="text-3xl font-bold mb-2 text-white text-center tracking-tight">Welcome Back</h1>
                <p className="text-neutral-400 text-center mb-8 text-sm">Sign in to continue to PromptSmith</p>

                {error && (
                    <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-sm text-red-200 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1.5 text-neutral-300">Email Address</label>
                        <input
                            type="email"
                            name="email"
                            required
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                            placeholder="john@example.com"
                            value={formData.email}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="relative">
                        <label className="block text-sm font-medium mb-1.5 text-neutral-300">Password</label>
                        <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            required
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all pr-10"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-[34px] text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                            {showPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745A10.251 10.251 0 0010 17.25c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029L3.28 2.22zm-1.086 5.402A8.538 8.538 0 002.25 10c1.11 3.551 4.54 6 8.75 6 .967 0 1.886-.129 2.742-.366l-2.102-2.102a3.106 3.106 0 01-1.554-1.554L5.427 7.228 2.194 7.622zm7.656 7.656l-1.636-1.636a1.606 1.606 0 01-.157.157l1.793 1.48z" clipRule="evenodd" />
                                    <path d="M10 3.25c-4.21 0-7.865 2.502-9.25 6.14a8.67 8.67 0 00.75 1.543l1.838-1.838a6.974 6.974 0 011.55-1.294 6.75 6.75 0 014.112-1.301c1.558 0 2.997.518 4.14 1.401l1.528-1.528A9.977 9.977 0 0010 3.25zM12.75 10a2.75 2.75 0 00-2.75-2.75c-.295 0-.58.05-.845.14l3.455 3.455c.09-.265.14-.55.14-.845z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 8.201 2.65 9.336 6.41.147.492.147 1.015 0 1.506-1.135 3.76-5.079 6.41-9.336 6.41S1.799 14.36.664 10.59zM10 14a4 4 0 100-8 4 4 0 000 8z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-white text-black font-semibold py-2.5 rounded-lg mt-6 hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Signing In...' : 'Sign In'}
                    </button>
                </form>

                <p className="text-center mt-6 text-sm text-neutral-500">
                    Don't have an account? <a href="/signup" className="text-white hover:underline">Sign up</a>
                </p>
            </div>
        </div>
    );
}
