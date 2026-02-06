'use client';

import { useState, useEffect } from 'react';

export default function AuthTokenCard() {
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        fetch('/api/user/me')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Failed to load profile');
            })
            .then(data => {
                setApiKey(data.appApiKey);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="h-24 w-full bg-neutral-900 animate-pulse rounded-xl"></div>;
    if (!apiKey) return null;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 w-full max-w-sm">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Your API Token</h3>

            <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5">
                <div className="font-mono text-sm text-neutral-300 truncate mr-2">
                    {isVisible ? apiKey : '•'.repeat(24)}
                </div>
                <button
                    onClick={() => setIsVisible(!isVisible)}
                    className="text-neutral-500 hover:text-white transition-colors focus:outline-none"
                    title={isVisible ? "Hide Token" : "Show Token"}
                >
                    {isVisible ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745A10.251 10.251 0 0010 17.25c-4.502 0-8.85-3.084-10.212-7.5.945-3.097 3.32-5.713 6.356-7.05L3.28 2.22zm2.843 3.904A10.253 10.253 0 0110 2.75c4.502 0 8.85 3.084 10.212 7.5a10.252 10.252 0 01-2.182 3.804l-8.62-8.62a3.754 3.754 0 01.62-.68z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            </div>

            <button
                onClick={() => {
                    if (apiKey) {
                        navigator.clipboard.writeText(apiKey);
                        // Optional: Show feedback, simpler to just rely on user knowing it works or adding small toast later
                    }
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 py-2 rounded-lg transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.379 6H4.5z" />
                </svg>
                Copy Token
            </button>

            <p className="text-[10px] text-neutral-500 mt-3">
                Use this key to authenticate your requests. Keep it secret.
            </p>
        </div>
    );
}
