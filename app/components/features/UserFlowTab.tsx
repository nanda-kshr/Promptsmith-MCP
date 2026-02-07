'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserFlowData {
    description: string;
}

interface UserFlowResponse {
    flows: {
        name: string;
        steps: string[];
        suggestions?: string[];
    }[];
}

interface UserFlowTabProps {
    projectId: string;
    initialData?: UserFlowData & { generated_output?: string };
}

export default function UserFlowTab({ projectId, initialData }: UserFlowTabProps) {
    const router = useRouter();
    const [formData, setFormData] = useState({
        description: initialData?.description || '',
        generated_output: initialData?.generated_output || ''
    });

    const [isEditing, setIsEditing] = useState(!(initialData as any)?.generated_output);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [lastSaved, setLastSaved] = useState(initialData?.description || '');

    const isDirty = formData.description.trim() !== lastSaved.trim();
    const isValid = formData.description.trim().length > 0;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSave = async () => {
        if (!isDirty || !isValid) return;

        setSaving(true);
        setMessage(null);

        // Normalize text
        const normalizedDescription = formData.description.trim().replace(/\s+/g, ' ');
        setFormData(prev => ({ ...prev, description: normalizedDescription, generated_output: '' }));

        try {
            const res = await fetch(`/api/projects/${projectId}/user_flow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_input: normalizedDescription })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to save user flow');
            }

            const result = await res.json();
            if (result.data) {
                setFormData(prev => ({
                    ...prev,
                    description: result.data.user_input,
                    generated_output: result.data.generated_output
                }));
                // Update last saved
                setLastSaved(result.data.user_input);

                if (result.data.refactored_version) {
                    router.refresh();
                }
            }

            setMessage({ type: 'success', text: 'User Flow generated!' });
            setIsEditing(false);
            setTimeout(() => setMessage(null), 3000);

        } catch (error: any) {
            console.error(error);
            // Check if it's the specific overloaded error
            const errorMsg = error.message === 'The AI model is currently overloaded. Please try again in a moment.'
                ? error.message
                : 'Failed to save changes';

            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setSaving(false);
        }
    };

    // Helper to parse the AI response
    const parsedFlows: UserFlowResponse | null = (() => {
        if (!formData.generated_output) return null;
        try {
            // Clean markdown code blocks if present // TODO: Move this to a utility if used often
            const cleanJson = formData.generated_output.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse User Flow JSON", e);
            return null;
        }
    })();

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">User Flows</h2>
                    <p className="text-neutral-400">Define the core journeys for different user types.</p>
                </div>
                {!isEditing && (formData as any).generated_output && (
                    <button
                        onClick={() => setIsEditing(true)}
                        disabled={saving}
                        className="text-sm bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                        Edit Inputs
                    </button>
                )}
            </div>

            {/* Input Section */}
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-300">
                        Describe the User Flows
                        <span className="ml-2 text-xs text-neutral-500 font-normal">
                            (Define the actors and their high-level journey)
                        </span>
                    </label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        disabled={!isEditing || saving}
                        rows={6}
                        className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-900/50 focus:border-blue-800 transition-all resize-none ${(!isEditing || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="Example: The User signs up, creates a project, and invites members. The Admin approves new projects and manages billing."
                    />
                </div>
            </div>

            {/* Generated Output: Flow Sections */}
            {parsedFlows && parsedFlows.flows && (
                <div className="space-y-12 pt-8 border-t border-neutral-800 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2 mb-8">
                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        <label className="block text-lg font-semibold text-blue-400">
                            Structured User Flows
                        </label>
                        <span className="text-xs text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded-full border border-neutral-800">AI Generated</span>
                    </div>

                    <div className="grid grid-cols-1 gap-12">
                        {parsedFlows.flows.map((flow, idx) => (
                            <div key={idx} className="space-y-6">
                                {/* Flow Header */}
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-900/30 text-blue-400 text-sm font-bold border border-blue-500/30">
                                        {idx + 1}
                                    </span>
                                    <h3 className="text-xl font-bold text-white tracking-tight">{flow.name}</h3>
                                    <div className="h-px flex-1 bg-neutral-800"></div>
                                </div>

                                {/* Steps Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ml-12">
                                    {flow.steps.map((step, stepIdx) => (
                                        <div key={stepIdx} className="relative group">
                                            <div className="absolute inset-0 bg-neutral-800/50 rounded-xl transform group-hover:scale-[1.02] transition-transform duration-300"></div>
                                            <div className="relative bg-neutral-900 border border-neutral-800 p-5 rounded-xl h-full flex flex-col gap-3 hover:border-blue-500/30 transition-colors shadow-lg shadow-black/20">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Step {stepIdx + 1}</span>
                                                    {stepIdx < flow.steps.length - 1 && (
                                                        <div className="hidden lg:block absolute -right-3 top-1/2 w-4 h-[2px] bg-neutral-800 z-10 translate-x-[2px]"></div>
                                                    )}
                                                </div>
                                                <p className="text-sm text-neutral-300 font-medium leading-relaxed">{step}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Suggestions Section */}
                                {flow.suggestions && flow.suggestions.length > 0 && (
                                    <div className="ml-12 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 mt-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                        <path fillRule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 001.075.676L10 15.082l5.925 2.844A.75.75 0 0017 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0010 2z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <div className="space-y-3 flex-1">
                                                    <h4 className="text-xs font-bold text-amber-500/80 uppercase tracking-wider">AI Suggestions</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {flow.suggestions.map((suggestion, sIdx) => (
                                                            <div key={sIdx} className="flex gap-2 items-start text-sm text-neutral-300">
                                                                <span className="text-amber-500/50 mt-1">•</span>
                                                                <span>{suggestion}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Fallback for raw text if JSON parse fails but content exists */}
            {!parsedFlows && formData.generated_output && (
                <div className="space-y-4 pt-8 border-t border-neutral-800">
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-sm">
                        Warning: Could not parse structured flow data. Showing raw output.
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-neutral-400 bg-black/50 p-4 rounded-xl font-mono">
                        {formData.generated_output}
                    </pre>
                </div>
            )}

            {/* Loading State */}
            {saving && !formData.generated_output && (
                <div className="pt-6 border-t border-neutral-800 text-center py-12 animate-pulse">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-blue-400 text-sm">Analyzing flows & structuring steps...</span>
                    </div>
                </div>
            )}

            {/* Actions */}
            {isEditing && (
                <div className="flex items-center justify-between pt-4 border-t border-neutral-900">
                    <div className="text-sm">
                        {message && (
                            <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                                {message.text}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsEditing(false)}
                            disabled={saving}
                            className="text-neutral-400 hover:text-white px-4 py-2 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!isValid || !isDirty || saving}
                            className="bg-white text-black px-6 py-2.5 rounded-lg font-medium hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!isValid ? "Inputs cannot be empty" : !isDirty ? "No changes to save" : ""}
                        >
                            {saving ? 'Generating...' : 'Save & Generate'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
