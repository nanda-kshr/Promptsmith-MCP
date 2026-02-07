'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DataModelField {
    name: string;
    description: string;
}

interface DataModel {
    name: string;
    fields: DataModelField[];
    relationships: string[];
}

interface DataModelsTabProps {
    projectId: string;
    initialData?: {
        generated_output?: string;
        user_custom_input?: string;
    };
}

export default function DataModelsTab({ projectId, initialData }: DataModelsTabProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [customInput, setCustomInput] = useState(initialData?.user_custom_input || '');

    // Parse Models
    const models: DataModel[] = (() => {
        if (!initialData?.generated_output) return [];
        try {
            const cleanJson = initialData.generated_output.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            return parsed.models || [];
        } catch (e) {
            console.error("Failed to parse data models", e);
            return [];
        }
    })();

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/data_models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // We send current models if we had editing capabilities, currently just regeneration from context + custom input
                    current_models: models,
                    user_custom_input: customInput
                })
            });

            if (!res.ok) throw new Error('Failed to generate models');

            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to generate models. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const hasModels = models.length > 0;

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Data Models</h2>
                <p className="text-neutral-400">Core entities and relationships defined by your architecture.</p>
            </div>

            {hasModels ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
                    {models.map((model, idx) => (
                        <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all hover:border-neutral-700 group relative">
                            {/* Card Header (Table Name) */}
                            <div className="bg-neutral-800/50 px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
                                <h3 className="font-bold text-blue-400 font-mono tracking-wide">{model.name}</h3>
                                <div className="h-2 w-2 rounded-full bg-blue-500/50" />
                            </div>

                            {/* Card Body (Fields) */}
                            <div className="p-5 space-y-4">
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2">Fields</p>
                                    <ul className="space-y-2">
                                        {model.fields.map((field, fIdx) => (
                                            <li key={fIdx} className="flex flex-col text-sm">
                                                <span className="font-mono text-neutral-300">{field.name}</span>
                                                <span className="text-[11px] text-neutral-500 leading-tight">{field.description}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {model.relationships && model.relationships.length > 0 && (
                                    <div className="pt-3 border-t border-neutral-800/50">
                                        <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2">Relationships</p>
                                        <ul className="space-y-1">
                                            {model.relationships.map((rel, rIdx) => (
                                                <li key={rIdx} className="text-xs text-emerald-400/80 flex items-center gap-1.5">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 shrink-0">
                                                        <path fillRule="evenodd" d="M16.5 4.5a.75.75 0 01.75.75v12.75a.75.75 0 01-1.293.53l-2.25-2.25a.75.75 0 010-1.06l2.25-2.25a.75.75 0 111.06 1.06l-.97.97V5.25a.75.75 0 01.75-.75zM3.5 15.5a.75.75 0 01-.75-.75V2.008a.75.75 0 011.293-.53l2.25 2.25a.75.75 0 11-1.06 1.06l-.97-.97v9.44a.75.75 0 01-.75.75z" clipRule="evenodd" />
                                                    </svg>
                                                    {rel}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* Decorative Corner */}
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-blue-500/5 to-transparent pointer-events-none" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-24 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
                    <p className="text-neutral-500">No data models defined yet.</p>
                </div>
            )}

            {/* Input & Action */}
            <div className="space-y-4 pt-8 border-t border-neutral-800">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Refine Models
                </h3>
                <p className="text-xs text-neutral-400">
                    Want to change a relationship or add a field? Describe it here.
                </p>
                <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="E.g. 'Add a status field to Order', 'User should have many Projects'"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-900/50 min-h-[100px] resize-none"
                />
            </div>

            <div className="flex justify-end pt-4 sticky bottom-4 z-20">
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-white/5"
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Architecting...
                        </>
                    ) : (
                        hasModels ? 'Update Data Models' : 'Generate Data Models'
                    )}
                </button>
            </div>
        </div>
    );
}
