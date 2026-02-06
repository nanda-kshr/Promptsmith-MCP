'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        geminiApiKey: '',
        password: '',
        confirmPassword: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/auth/signup', {
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

            // Redirect to login or home (for now just showing success or redirecting to home)
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
                <h1 className="text-3xl font-bold mb-2 text-white text-center tracking-tight">Create Account</h1>
                <p className="text-neutral-400 text-center mb-8 text-sm">Sign up to get started with PromptSmith</p>

                {/* Disclaimer / Warning */}
                <div className="mb-6 bg-amber-950/30 border border-amber-900/50 rounded-lg p-4 text-xs text-amber-200/90 leading-relaxed">
                    <p className="font-semibold mb-1 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        Open Source Disclaimer
                    </p>
                    This is an open source project connected to a personal database. Please fork and run it locally or use valid credentials at your own risk. Your Gemini API Key will be encrypted before storage.
                </div>

                {error && (
                    <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-sm text-red-200 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1.5 text-neutral-300">Full Name</label>
                        <input
                            type="text"
                            name="name"
                            required
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={handleChange}
                        />
                    </div>

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

                    <div>
                        <label className="block text-sm font-medium mb-1.5 text-neutral-300">Gemini API Key</label>
                        <input
                            type="password"
                            name="geminiApiKey"
                            required
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                            placeholder="AIzaSy..."
                            value={formData.geminiApiKey}
                            onChange={handleChange}
                        />
                        <p className="text-[10px] text-neutral-500 mt-1">Safely encrypted in the database.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
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
                        <div className="relative">
                            <label className="block text-sm font-medium mb-1.5 text-neutral-300">Confirm</label>
                            <input
                                type={showPassword ? "text" : "password"}
                                name="confirmPassword"
                                required
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all pr-10"
                                placeholder="••••••••"
                                value={formData.confirmPassword}
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
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-white text-black font-semibold py-2.5 rounded-lg mt-6 hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>
                </form>

                <p className="text-center mt-6 text-sm text-neutral-500">
                    Already have an account? <a href="#" className="text-white hover:underline">Log in</a>
                </p>
            </div>
        </div>
    );
}
