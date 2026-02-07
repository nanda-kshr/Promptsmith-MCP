'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ApiEndpoint {
    name: string;
    method: string;
    input: string;
    output: string;
    errors: string[];
}

interface ApisTabProps {
    projectId: string;
    initialData?: {
        generated_output?: string;
        user_custom_input?: string;
    };
}

const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    POST: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    PUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
    PATCH: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

type GenerationStep = 'idle' | 'actions' | 'mappings' | 'contracts' | 'complete';

export default function ApisTab({ projectId, initialData }: ApisTabProps) {
    const router = useRouter();
    const [status, setStatus] = useState<GenerationStep>('idle');
    const [customInput, setCustomInput] = useState(initialData?.user_custom_input || '');
    const [error, setError] = useState<string | null>(null);

    // Parse APIs
    const apis: ApiEndpoint[] = (() => {
        if (!initialData?.generated_output) return [];
        try {
            const cleanJson = initialData.generated_output.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            return parsed.apis || [];
        } catch (e) {
            console.error("Failed to parse apis", e);
            return [];
        }
    })();

    const executeStep = async (stepName: string) => {
        const res = await fetch(`/api/projects/${projectId}/apis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                step: stepName,
                user_custom_input: customInput
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Failed at step: ${stepName}`);
        }
        return await res.json();
    };

    const handleGenerate = async () => {
        setStatus('actions');
        setError(null);

        try {
            // Step 1: Actions
            await executeStep('identify_actions');
            setStatus('mappings');

            // Step 2: Mappings
            await executeStep('map_actions');
            setStatus('contracts');

            // Step 3: Contracts
            await executeStep('define_contracts');

            setStatus('complete');
            router.refresh();

            // Reset to idle after a simplified delay or keep complete
            setTimeout(() => setStatus('idle'), 2000);

        } catch (error: any) {
            console.error(error);
            setError(error.message || 'Generation failed');
            setStatus('idle');
        }
    };

    const hasApis = apis.length > 0;
    const isGenerating = status !== 'idle' && status !== 'complete';

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">API Contracts</h2>
                <p className="text-neutral-400">Defined endpoints based on your system actions.</p>
            </div>

            {/* Progress Stepper */}
            {isGenerating && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4 shadow-2xl">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider animate-pulse">
                        Architecting System...
                    </h3>
                    <div className="space-y-3">
                        <StepIndicator
                            label="Identifying System Actions"
                            state={status === 'actions' ? 'active' : 'done'}
                        />
                        <StepIndicator
                            label="Mapping Data Dependencies"
                            state={status === 'actions' ? 'pending' : (status === 'mappings' ? 'active' : 'done')}
                        />
                        <StepIndicator
                            label="Defining API Contracts"
                            state={(status === 'actions' || status === 'mappings') ? 'pending' : (status === 'contracts' ? 'active' : 'done')}
                        />
                    </div>
                </div>
            )}

            {error && (
                <div className={`border p-4 rounded-xl text-sm flex items-start gap-3 ${error.includes('Quota') ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
                    }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 mt-0.5">
                        {error.includes('Quota') ? (
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        ) : (
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        )}
                    </svg>
                    <div>
                        <p className="font-bold">{error.includes('Quota') ? 'Free Tier Limit Reached' : 'Generation Failed'}</p>
                        <p className="opacity-90">{error}</p>
                    </div>
                </div>
            )}

            {hasApis && !isGenerating ? (
                <div className="space-y-4">
                    {apis.map((api, idx) => (
                        <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-all">
                            {/* Header */}
                            <div className="px-5 py-4 flex items-start sm:items-center justify-between gap-4 border-b border-neutral-800/50">
                                <div className="flex items-center gap-4">
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${METHOD_COLORS[api.method] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>
                                        {api.method}
                                    </span>
                                    <h3 className="font-mono text-sm text-white font-medium">{api.name}</h3>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Input / Output */}
                                <div className="space-y-6">
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Input</p>
                                        <p className="text-sm text-neutral-300 leading-relaxed font-mono text-xs bg-neutral-950/50 p-2 rounded">{api.input}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Output</p>
                                        <p className="text-sm text-neutral-300 leading-relaxed font-mono text-xs bg-neutral-950/50 p-2 rounded">{api.output}</p>
                                    </div>
                                </div>

                                {/* Errors */}
                                <div className="space-y-1.5">
                                    <p className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Possible Errors</p>
                                    <ul className="space-y-2">
                                        {api.errors.map((err, eIdx) => (
                                            <li key={eIdx} className="flex items-start gap-2 text-xs text-red-400/80">
                                                <span className="mt-0.5 w-1 h-1 rounded-full bg-red-500/50 shrink-0" />
                                                {err}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : !isGenerating && (
                <div className="text-center py-24 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
                    <p className="text-neutral-500">No APIs defined yet.</p>
                </div>
            )}

            {/* Input & Action */}
            <div className={`space-y-4 pt-8 border-t border-neutral-800 ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Refine APIs
                </h3>
                <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="E.g. 'All endpoints must support pagination via ?page=x', 'Use Snake Case for JSON keys'"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-900/50 min-h-[100px] resize-none"
                    disabled={isGenerating}
                />
            </div>

            <div className="flex justify-end pt-4 sticky bottom-4 z-20">
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-white/5"
                >
                    {isGenerating ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Processing...
                        </>
                    ) : (
                        hasApis ? 'Regenerate APIs' : 'Generate APIs'
                    )}
                </button>
            </div>
        </div>
    );
}

function StepIndicator({ label, state }: { label: string, state: 'pending' | 'active' | 'done' }) {
    return (
        <div className={`flex items-center gap-3 transition-colors duration-300 ${state === 'pending' ? 'opacity-30' : 'opacity-100'}`}>
            <div className={`
                w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300
                ${state === 'done' ? 'bg-emerald-500 border-emerald-500 text-black' :
                    state === 'active' ? 'bg-blue-500/20 border-blue-500 text-blue-500 animate-pulse' :
                        'bg-transparent border-neutral-600 text-neutral-600'}
            `}>
                {state === 'done' && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                )}
            </div>
            <span className={`text-sm font-mono ${state === 'active' ? 'text-blue-400' : state === 'done' ? 'text-white' : 'text-neutral-500'}`}>
                {label}
            </span>
        </div>
    );
}
