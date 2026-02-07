'use client';

import { useState } from 'react';

export default function GeminiKeyCard() {
    const [newKey, setNewKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleUpdate = async () => {
        if (!newKey.trim()) {
            setMessage({ type: 'error', text: 'Please enter a valid API key.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch('/api/user/gemini-key', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geminiApiKey: newKey.trim() }),
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: 'API Key updated!' });
                setNewKey('');
            } else {
                setMessage({ type: 'error', text: data.error || 'Update failed.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 w-full max-w-sm">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Update Gemini API Key</h3>

            <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Enter new Gemini API Key"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />

            <button
                onClick={handleUpdate}
                disabled={loading}
                className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-medium text-neutral-400 hover:text-white bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
                {loading ? (
                    <svg className="animate-spin h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.39 2.04l-1.24 1.24a7 7 0 0011.09-2.623l.054-.156a.75.75 0 011.32.246l-.019.07a.75.75 0 01-.12.29 8.438 8.438 0 01-4.086 3.84.75.75 0 01-.77-.114l-.088-.104a4.008 4.008 0 01-2.002-1.21l-1.228 1.227a.75.75 0 11-1.06-1.06l7.5-7.5a.75.75 0 011.06 1.061l-1.227 1.228a4.008 4.008 0 011.21 2.002l.104.088a.75.75 0 01.114.77 8.438 8.438 0 01-3.84 4.086.75.75 0 01-.29.12l-.07.019a.75.75 0 01-.246-1.32l.156-.054a7.002 7.002 0 002.623-11.09l-1.24 1.241a5.5 5.5 0 01-2.04 9.39l-.133.034a.75.75 0 01-.56-1.376l.163-.066z" clipRule="evenodd" />
                    </svg>
                )}
                {loading ? 'Updating...' : 'Update Key'}
            </button>

            {message && (
                <p className={`text-[10px] mt-2 ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {message.text}
                </p>
            )}

            <p className="text-[10px] text-neutral-500 mt-3">
                Your key is encrypted before storage.
            </p>
        </div>
    );
}
