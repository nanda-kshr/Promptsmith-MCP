'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MediaFile {
    file_name: string;
    prompt: string;
}

interface MediaItem {
    name: string;
    description: string;
    files: MediaFile[];
}

interface MediaTabProps {
    projectId: string;
    initialData?: {
        generated_output?: string;
        user_custom_input?: string;
    };
}

export default function MediaTab({ projectId, initialData }: MediaTabProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [customInput, setCustomInput] = useState(initialData?.user_custom_input || '');

    const initialMedia: MediaItem[] = (() => {
        if (!initialData?.generated_output) return [];
        try {
            const cleanJson = initialData.generated_output.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            // New shape: { images: [ { name, description, files: [{ file_name, prompt }] } ] }
            if (Array.isArray(parsed.images)) {
                // Backwards compatibility: if an item has a direct prompt, wrap it into a single-file group
                return parsed.images.map((item: any) => {
                    if (item.files && Array.isArray(item.files)) {
                        return item as MediaItem;
                    }
                    if (item.prompt) {
                        const safeFileName = `${item.name || 'image'}`
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '_')
                            .replace(/^_+|_+$/g, '') || 'image';
                        return {
                            name: item.name || 'Image',
                            description: item.description || '',
                            files: [{ file_name: `${safeFileName}.png`, prompt: item.prompt }]
                        } as MediaItem;
                    }
                    return item as MediaItem;
                });
            }
            return [];
        } catch (e) {
            console.error('Failed to parse media suggestions', e);
            return [];
        }
    })();

    const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialMedia);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_media: mediaItems,
                    user_custom_input: customInput
                })
            });

            if (!res.ok) throw new Error('Failed to generate media');
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to generate media suggestions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAndNext = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_media: mediaItems,
                    user_custom_input: customInput,
                    save_only: true
                })
            });

            if (!res.ok) throw new Error('Failed to save media');
            router.push(`/projects/${projectId}?tab=rules`);
        } catch (error) {
            console.error(error);
            alert('Failed to save media. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (index: number) => {
        setMediaItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleReset = () => {
        setMediaItems(initialMedia);
        setCustomInput(initialData?.user_custom_input || '');
        setCopiedIndex(null);
    };

    const handleCopyPrompts = async (files: MediaFile[], index: number) => {
        try {
            const text = files
                .map(f => `${f.file_name}: ${f.prompt}`)
                .join('\n\n');
            await navigator.clipboard.writeText(text);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(current => (current === index ? null : current)), 1500);
        } catch (e) {
            console.error('Failed to copy prompt', e);
        }
    };

    const hasMedia = mediaItems.length > 0;

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Media & Imagery</h2>
                <p className="text-neutral-400">
                    Let the AI suggest key images (hero, onboarding, empty states, etc.) for your product.
                </p>
            </div>

            {hasMedia ? (
                <div className="space-y-2">
                    <div className="text-xs text-neutral-500 uppercase tracking-wider px-2 flex justify-between">
                        <span>Name, Description & Files</span>
                        <span>Actions</span>
                    </div>
                    <div className="divide-y divide-neutral-900 border border-neutral-900 rounded-xl bg-neutral-950/40">
                        {mediaItems.map((item, idx) => (
                            <div
                                key={idx}
                                className="group relative flex items-start justify-between gap-4 px-4 py-3 hover:bg-neutral-900/70 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-blue-300 truncate" title={item.name}>
                                        {item.name}
                                    </p>
                                    <p className="text-xs text-neutral-300 mt-0.5 line-clamp-2" title={item.description}>
                                        {item.description}
                                    </p>
                                    {item.files && item.files.length > 0 && (
                                        <p className="text-[11px] text-neutral-500 mt-1 truncate" title={item.files.map(f => f.file_name).join(', ')}>
                                            {item.files.map(f => f.file_name).join(', ')}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 ml-2">
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(idx)}
                                        className="text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
                                    >
                                        Delete
                                    </button>

                                    <div className="relative">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 hover:bg-neutral-700 transition-colors"
                                        >
                                            View Prompt
                                        </button>

                                        <div className="pointer-events-none absolute right-0 top-8 z-30 w-80 max-w-[80vw] opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                                            <div className="bg-black border border-neutral-700 rounded-lg shadow-2xl p-3 space-y-2 max-h-80 overflow-auto">
                                                {item.files && item.files.length > 0 ? (
                                                    item.files.map((file, fileIdx) => (
                                                        <div key={fileIdx} className="space-y-1">
                                                            <p className="text-[11px] font-mono text-emerald-300">
                                                                {file.file_name}
                                                            </p>
                                                            <p className="text-[11px] text-neutral-200 whitespace-pre-wrap font-mono">
                                                                {file.prompt}
                                                            </p>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-[11px] text-neutral-400">No files defined for this media group.</p>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyPrompts(item.files || [], idx)}
                                                    className="w-full flex items-center justify-center gap-2 text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                                                >
                                                    {copiedIndex === idx ? 'Copied!' : 'Copy All Prompts'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-24 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
                    <p className="text-neutral-500">No media suggestions yet.</p>
                </div>
            )}

            <div className="space-y-4 pt-8 border-t border-neutral-800">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Additional Media Requirements
                </h3>
                <p className="text-xs text-neutral-400">
                    Describe any extra visuals you want (brand mood, specific screens, marketing assets, etc.).
                </p>
                <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="E.g. 'Need 3 onboarding illustrations in a playful flat style', 'Dark-mode dashboard hero image', 'Mobile screenshots for App Store listing'"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-900/50 min-h-[100px] resize-none"
                />
            </div>

            <div className="flex justify-end gap-3 pt-4 sticky bottom-4 z-20">
                <button
                    onClick={handleReset}
                    disabled={loading}
                    className="bg-neutral-800 text-neutral-200 px-6 py-3 rounded-xl font-bold hover:bg-neutral-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-700"
                >
                    Reset
                </button>
                <button
                    onClick={handleSaveAndNext}
                    disabled={loading}
                    className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-blue-900/20"
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save & Next'
                    )}
                </button>
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-white/5"
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Suggesting Media...
                        </>
                    ) : (
                        hasMedia ? 'Regenerate Suggestions' : 'Suggest Media'
                    )}
                </button>
            </div>
        </div>
    );
}
