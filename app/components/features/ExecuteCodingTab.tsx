'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ExecuteCodingTabProps {
    projectId: string;
    initialData?: {
        stage_status?: Record<string, string>;
    };
}

// Stage Definition from Plan
const STAGES = [
    { key: 'execute_coding.check', label: '0. Pre-Flight Check', description: 'Verify Project Initialization' },
    { key: 'execute_coding.stage1', label: '1. Environment', description: 'Setup .env and config' },
    { key: 'execute_coding.stage2', label: '2. Skeleton', description: 'Create folders and files' },
    { key: 'execute_coding.stage3', label: '3. Core Setup', description: 'Bootstrap entry points' },
    { key: 'execute_coding.stage4', label: '4. API Docs', description: 'Generate API.md' },
    { key: 'execute_coding.stage5', label: '5. Frontend Skeleton', description: 'Create frontend folders' },
    { key: 'execute_coding.stage6', label: '6. Frontend Code', description: 'Generate frontend files' },
    { key: 'execute_coding.stage7', label: '7. API Tests', description: 'Generate Test Suite' },
];

export default function ExecuteCodingTab({ projectId, initialData }: ExecuteCodingTabProps) {
    const router = useRouter();
    const [currentStageIndex, setCurrentStageIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [prompts, setPrompts] = useState<any[]>([]); // Generated Prompts
    const [error, setError] = useState<string | null>(null);

    // Load status from initialData to determine current active stage
    const [completedStageIndex, setCompletedStageIndex] = useState(0);

    // Load State Function
    const loadState = async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/execute_coding`);
            if (res.ok) {
                const data = await res.json();
                if (data.prompts) setPrompts(data.prompts);

                if (data.stage_status) {
                    // Calculate completed index based on status
                    let maxCompleted = -1;
                    STAGES.forEach((stage, idx) => {
                        const statusKey = stage.key.replace('.', '_'); // match DB key format
                        if (data.stage_status[statusKey] === 'COMPLETED') {
                            maxCompleted = idx;
                        }
                    });


                    const nextStage = Math.min(maxCompleted + 1, STAGES.length);
                    setCompletedStageIndex(nextStage);
                    // We only set currentStageIndex on initial load to avoid jumping while user is viewing
                }
            }
        } catch (e) {
            console.error("Failed to load state", e);
        }
    };

    // Initial Fetch & Auto Refresh
    useEffect(() => {
        loadState();
        setCurrentStageIndex(0); // Default start

        const interval = setInterval(loadState, 60000); // 60s Auto-Refresh
        return () => clearInterval(interval);
    }, [projectId]);

    const handleRunStage = async (stageKey: string, autoAdvance = false) => {
        setLoading(true);
        setError(null);

        // Optimistically clear local prompts for this stage
        setPrompts(prev => prev.filter(p => p.stage !== stageKey));

        try {
            if (stageKey === 'execute_coding.stage3' || stageKey === 'execute_coding.stage6') {
                // --- BATCH MODE ---
                let offset = 0;
                let isComplete = false;

                while (!isComplete) {
                    const res = await fetch(`/api/projects/${projectId}/execute_coding`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            stage: stageKey,
                            action: 'generate',
                            offset,
                            limit: 5
                        })
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || 'Batch Failed');
                    }

                    const data = await res.json();

                    if (data.prompts) {
                        setPrompts(prev => {
                            // Dedupe to be safe
                            const newIds = new Set(data.prompts.map((p: any) => p._id));
                            const kept = prev.filter(p => !newIds.has(p._id));
                            return [...kept, ...data.prompts];
                        });
                    }

                    if (data.pagination) {
                        offset = data.pagination.nextOffset;
                        isComplete = data.pagination.isComplete;
                    } else {
                        isComplete = true;
                    }
                }
            } else {
                // --- STANDARD MODE ---
                const res = await fetch(`/api/projects/${projectId}/execute_coding`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stage: stageKey,
                        action: 'generate'
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed');
                }

                const data = await res.json();

                // Update prompts: append new ones
                if (data.prompts) {
                    setPrompts(prev => [...prev, ...data.prompts]);
                }
            }

            let nextIndex = currentStageIndex;

            // Mark current stage as complete (allow navigation up to this point + 1)
            const stageIndex = STAGES.findIndex(s => s.key === stageKey);

            // Update completed status safely
            setCompletedStageIndex(prev => Math.max(prev, stageIndex + 1));

            // Auto-advance logic: Go to next stage based on what just finished
            if (stageIndex < STAGES.length - 1) {
                setCurrentStageIndex(stageIndex + 1);
            }

            return stageIndex + 1; // Return the next index for chaining

        } catch (err: any) {
            setError(err.message);
            throw err; // Stop chain on error
        } finally {
            if (!autoAdvance) setLoading(false);
        }
    };

    const handleAutoGenerate = async () => {
        setLoading(true);
        setError(null);

        try {
            // 1. Trigger Reset on Backend
            const resetRes = await fetch(`/api/projects/${projectId}/execute_coding`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset' })
            });

            if (!resetRes.ok) throw new Error("Failed to reset project state");

            // 2. Reset Local State
            setPrompts([]);
            setCompletedStageIndex(0);
            setCurrentStageIndex(0);

            // 3. Sequential Generation Loop from Stage 0
            for (let i = 0; i < STAGES.length; i++) {
                await handleRunStage(STAGES[i].key, true);

                // Small delay to let UI breathe
                await new Promise(r => setTimeout(r, 1000));

                if (i === STAGES.length - 1) {
                    setLoading(false);
                }
            }
        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        } finally {
            router.refresh();
        }
    };

    const handleCompleteStage = async (stageKey: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/projects/${projectId}/execute_coding`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'complete_stage',
                    stage: stageKey
                })
            });

            if (!res.ok) throw new Error("Failed to complete stage");
            setCompletedStageIndex(Math.min(currentStageIndex + 1, STAGES.length));
        } catch (e: any) {
            console.error(e);
            setError("Failed to mark as complete");
        } finally {
            setLoading(false);
        }
    };

    const handleGenericSave = async (promptId: string, newText: string) => {
        // Optimistic update
        setPrompts(prev => prev.map(p => p._id === promptId ? { ...p, prompt_text: newText } : p));

        await fetch(`/api/projects/${projectId}/execute_coding`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptId, prompt_text: newText })
        });
    };

    // Stage 2 Toggle State
    const [viewMode, setViewMode] = useState<'tree' | 'code'>('tree');

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            {/* ... (Header components same as before) ... */}
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Prompt Factory</h2>
                <p className="text-neutral-400">Generate atomic coding prompts for your agent.</p>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left: Stepper */}
                <div className="col-span-1 space-y-2">
                    {STAGES.map((stage, idx) => {
                        const isActive = idx === currentStageIndex;
                        const isUnlocked = idx <= completedStageIndex;
                        const isDone = idx < completedStageIndex;

                        return (
                            <button
                                key={stage.key}
                                onClick={() => { if (isUnlocked) setCurrentStageIndex(idx) }}
                                disabled={!isUnlocked}
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${isActive
                                    ? 'bg-blue-500/10 border-blue-500/50 text-white shadow-lg shadow-blue-500/10'
                                    : isUnlocked
                                        ? 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                                        : 'bg-transparent border-transparent text-neutral-600 cursor-not-allowed'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-sm">{stage.label}</p>
                                        <p className="text-xs opacity-70 mt-0.5">{stage.description}</p>
                                    </div>
                                    {isDone && (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right: Active Stage Action & Output */}
                <div className="col-span-2 space-y-6">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 min-h-[300px]">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-xl">{STAGES[currentStageIndex]?.label || "Completed"}</h3>
                            <div className="flex gap-3">
                                {/* Show "Save & Complete" only if prompts exist AND it's not already completed */}
                                {prompts.filter(p => p.stage === STAGES[currentStageIndex]?.key).length > 0 && completedStageIndex <= currentStageIndex && (
                                    <button
                                        disabled={loading}
                                        onClick={() => handleCompleteStage(STAGES[currentStageIndex].key)}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-500 transition-colors disabled:opacity-50 text-xs shadow-lg shadow-emerald-500/10 flex items-center gap-2"
                                    >
                                        {loading ? 'Saving...' : 'Save & Complete'}
                                    </button>
                                )}

                                <button
                                    onClick={loadState}
                                    title="Refresh Prompts"
                                    className="p-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.433l-.31-.31a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.312h-2.433a.75.75 0 000 1.5h4.185a.75.75 0 00.75-.75z" clipRule="evenodd" />
                                    </svg>
                                </button>

                                <button
                                    onClick={() => handleRunStage(STAGES[currentStageIndex].key)}
                                    disabled={loading}
                                    className="bg-neutral-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-neutral-700 transition-colors disabled:opacity-50 text-xs border border-neutral-700"
                                >
                                    Run This Stage
                                </button>
                                <button
                                    onClick={handleAutoGenerate}
                                    disabled={loading}
                                    className="bg-white text-black px-6 py-2 rounded-lg font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50 text-xs shadow-lg shadow-white/10 flex items-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                            Automating...
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.75 9.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
                                            </svg>
                                            Generate All
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* STAGE 1 SPECIAL UI: ENV VAR EDITOR */}
                        {currentStageIndex === 1 && prompts.filter(p => p.stage === STAGES[1].key).length > 0 ? (
                            <EnvVarEditor
                                originalPrompts={prompts.filter(p => p.stage === STAGES[1].key)}
                                onSave={async (newVars) => {
                                    // 1. Construct new JSON Prompt Text
                                    const promptToUpdate = prompts.find(p => p.stage === STAGES[1].key);
                                    if (!promptToUpdate) return;

                                    const newJson = { ENV: newVars };
                                    const newText = JSON.stringify(newJson, null, 2);

                                    // 2. Call API to update DB
                                    try {
                                        await handleGenericSave(promptToUpdate._id, newText);
                                    } catch (e) {
                                        console.error("Failed to save vars", e);
                                        setError("Failed to save changes");
                                    }
                                }}
                            />
                        ) : (currentStageIndex === 2 || currentStageIndex === 5) && prompts.length > 0 ? (
                            /* STAGE 2 & 5 SPECIAL UI: FILE TREE with TOGGLE */
                            <div className="space-y-4">
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setViewMode('tree')}
                                        className={`text-xs px-3 py-1 rounded ${viewMode === 'tree' ? 'bg-blue-500/20 text-blue-400' : 'text-neutral-500 hover:text-white'}`}
                                    >
                                        Tree View
                                    </button>
                                    <button
                                        onClick={() => setViewMode('code')}
                                        className={`text-xs px-3 py-1 rounded ${viewMode === 'code' ? 'bg-blue-500/20 text-blue-400' : 'text-neutral-500 hover:text-white'}`}
                                    >
                                        Raw Editor
                                    </button>
                                </div>
                                {viewMode === 'tree' ? (
                                    <FileTreeViewer promptText={prompts.find(p => p.stage === STAGES[currentStageIndex].key)?.prompt_text || ""} />
                                ) : (
                                    <EditablePromptCard
                                        prompt={prompts.find(p => p.stage === STAGES[currentStageIndex].key)}
                                        onSave={handleGenericSave}
                                    />
                                )}
                            </div>
                        ) : (
                            /* Generic Prompts Display (NOW EDITABLE) */
                            prompts.filter(p => p.stage === STAGES[currentStageIndex].key).length > 0 ? (
                                <div className="space-y-4">
                                    {prompts.filter(p => p.stage === STAGES[currentStageIndex].key).map((p, idx) => (
                                        <EditablePromptCard key={idx} prompt={p} onSave={handleGenericSave} />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-neutral-600">
                                    <p>No prompts generated for this stage yet.</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- SUB-COMPONENT: Env Var Editor ---
function EnvVarEditor({ originalPrompts, onSave }: { originalPrompts: any[], onSave: (vars: any) => void }) {
    const [envVars, setEnvVars] = useState<Record<string, string>>({});
    const [parsed, setParsed] = useState(false);

    useEffect(() => {
        if (originalPrompts.length > 0 && !parsed) {
            try {
                // Extracts JSON from the first prompt's text
                const text = originalPrompts[0].prompt_text;
                // AI might wrap in ```json ... ``` or just return the object string
                const clean = text.replace(/```json\n?|\n?```/g, '').trim();
                const json = JSON.parse(clean);

                if (json.ENV) {
                    setEnvVars(json.ENV);
                    setParsed(true);
                }
            } catch (e) {
                console.error("Failed to parse Env Vars JSON", e);
            }
        }
    }, [originalPrompts]);

    const handleChange = (key: string, desc: string) => {
        setEnvVars(prev => ({ ...prev, [key]: desc }));
    };

    const handleDelete = (key: string) => {
        const newVars = { ...envVars };
        delete newVars[key];
        setEnvVars(newVars);
    };

    const handleAdd = () => {
        setEnvVars(prev => ({ ...prev, "NEW_VAR": "Description here..." }));
    };

    if (!parsed) return <div className="text-neutral-500">Parsing Env Configuration...</div>;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h4 className="font-bold text-blue-400 text-sm">Environment Configuration</h4>
                    <button
                        onClick={() => onSave(envVars)}
                        className="text-xs bg-emerald-500/20 text-emerald-500 border border-emerald-500/50 px-3 py-1 rounded hover:bg-emerald-500/30 transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
                <button onClick={handleAdd} className="text-xs bg-neutral-800 px-3 py-1 rounded hover:bg-neutral-700">
                    + Add Variable
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(envVars).map(([key, desc]) => (
                    <div key={key} className="bg-black/50 border border-neutral-800 p-4 rounded-lg relative group">
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleDelete(key)} className="text-red-500 hover:text-red-400">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 001.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <input
                            value={key}
                            onChange={(e) => {
                                const newKey = e.target.value;
                                const val = envVars[key];
                                const newObj = { ...envVars };
                                delete newObj[key];
                                newObj[newKey] = val;
                                setEnvVars(newObj);
                            }}
                            className="bg-transparent font-mono text-emerald-400 font-bold w-full mb-2 focus:outline-none focus:border-b border-emerald-500/50"
                        />
                        <textarea
                            value={desc}
                            onChange={(e) => handleChange(key, e.target.value)}
                            className="bg-transparent text-xs text-neutral-400 w-full resize-none focus:outline-none"
                            rows={2}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- SUB-COMPONENT: File Tree Viewer ---
function FileTreeViewer({ promptText }: { promptText: string }) {
    const [treeData, setTreeData] = useState<any[]>([]);
    const [parsed, setParsed] = useState(false);

    useEffect(() => {
        try {
            // AI might return { "tree": [...] } or just the array inside markdown
            const clean = promptText.replace(/```json\n?|\n?```/g, '').trim();
            // Try to find the JSON start
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                if (json.tree) {
                    setTreeData(json.tree);
                    setParsed(true);
                }
            }
        } catch (e) { console.error("Tree Parse Error", e); }
    }, [promptText]);

    if (!parsed) return <div className="text-neutral-500 text-xs text-center p-4 border border-neutral-800 rounded">Analysis in progress... Raw output available below.</div>;

    const renderNode = (node: any, depth = 0) => {
        const isFolder = node.type === 'folder';
        return (
            <div key={node.name} style={{ paddingLeft: depth * 12 }} className="py-0.5 border-l border-neutral-800/50 hover:bg-white/5 transition-colors rounded-sm">
                <div className="flex items-center gap-1.5 text-xs text-neutral-300 whitespace-nowrap">
                    {isFolder ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-yellow-500/80 shrink-0">
                            <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-blue-400/80 shrink-0">
                            <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1-1.415V4.5A1.5 1.5 0 0014.5 3h-2A1.5 1.5 0 0011 4.5v.085A1.5 1.5 0 0010 6v.382H4.5zM6 5.5v13h8v-13H6zm8.883-2.673a.25.25 0 00-.133-.16V4.5a.25.25 0 00-.25.25v.75c0 .138.112.25.25.25h.75a.25.25 0 00.25-.25v-.75a.25.25 0 00-.25-.25h-.617zM6.25 7A.25.25 0 006 7.25v.75c0 .138.112.25.25.25h.75a.25.25 0 00.25-.25v-.75a.25.25 0 00-.25-.25h-.75zm0 3.5a.25.25 0 00-.25.25v.75c0 .138.112.25.25.25h.75a.25.25 0 00.25-.25v-.75a.25.25 0 00-.25-.25h-.75z" clipRule="evenodd" />
                        </svg>
                    )}
                    <span className="font-mono">{node.name}</span>
                </div>
                {isFolder && node.children && (
                    <div className="ml-1">
                        {node.children.map((child: any) => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-black/50 border border-neutral-800 rounded-lg p-4 overflow-x-auto max-h-[500px]">
            <h4 className="font-bold text-yellow-500 text-sm mb-4 sticky top-0 bg-black/90 p-2 border-b border-neutral-800">
                Proposed File Structure
            </h4>
            <div className="space-y-1">
                {treeData.map(node => renderNode(node))}
            </div>
        </div>
    );
}

// --- SUB-COMPONENT: Editable Prompt Card ---
function EditablePromptCard({ prompt, onSave }: { prompt: any, onSave: (id: string, text: string) => Promise<void> }) {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(prompt.prompt_text);
    const [saving, setSaving] = useState(false);

    // Sync if prop changes externally
    useEffect(() => { setText(prompt.prompt_text); }, [prompt.prompt_text]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(prompt._id, text);
            setIsEditing(false);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-black border border-neutral-800 rounded-lg p-4 group relative">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-blue-400 text-sm">{prompt.title}</h4>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="text-xs text-neutral-500 hover:text-white"
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="text-xs bg-emerald-500 text-black font-bold px-3 py-1 rounded hover:bg-emerald-400"
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="text-xs text-neutral-500 hover:text-blue-400"
                        >
                            Edit
                        </button>
                    )}
                </div>
            </div>

            {isEditing ? (
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-3 text-xs font-mono text-neutral-300 focus:outline-none focus:border-blue-500/50 min-h-[200px]"
                />
            ) : (
                <p className="font-mono text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                    {text}
                </p>
            )}
        </div>
    );
}
