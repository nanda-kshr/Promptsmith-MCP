'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

// Update Interface
interface TechStack {
    [key: string]: string | undefined; // Allow dynamic keys
    frontend?: string;
    backend?: string;
    database?: string;
    auth?: string;
    ai?: string;
    hosting?: string;
}

interface Suggestion {
    category: string;
    type: 'mandatory' | 'optional' | 'unnecessary';
    text: string;
    suggested_value?: string;
}

interface AnalysisResult {
    feasibility: 'high' | 'medium' | 'low';
    analysis: string;
    suggestions: Suggestion[];
}

interface TechChoicesTabProps {
    projectId: string;
    initialData?: {
        selected_stack?: TechStack;
        user_notes?: string;
        generated_output?: string;
    };
}

const TECH_OPTIONS = {
    frontend: ['React', 'Next.js', 'Vue', 'Svelte', 'Angular', 'HTML/CSS/JS', 'Flutter Web'],
    backend: ['Node.js (Express)', 'Next.js API', 'Python (FastAPI)', 'Python (Django)', 'Go (Gin)', 'Java (Spring)'],
    database: ['MongoDB', 'PostgreSQL', 'MySQL', 'Firebase', 'Supabase', 'Redis'],
    auth: ['NextAuth', 'Firebase Auth', 'Clerk', 'Auth0', 'Custom JWT'],
    ai: ['Gemini', 'OpenAI', 'Anthropic', 'HuggingFace', 'None'],
    hosting: ['Vercel', 'AWS', 'Google Cloud', 'Heroku', 'Netlify']
};

export default function TechChoicesTab({ projectId, initialData }: TechChoicesTabProps) {
    const router = useRouter();
    const [stack, setStack] = useState<TechStack>(initialData?.selected_stack || {});
    const [notes, setNotes] = useState<string>(initialData?.user_notes || '');
    // Removed isEditing state - Always editing
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [showForceProceed, setShowForceProceed] = useState(false);

    // Initial analysis parsing
    const parsedAnalysis: AnalysisResult | null = (() => {
        if (!initialData?.generated_output) return null;
        try {
            const cleanJson = initialData.generated_output.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            return null;
        }
    })();

    const [analysis, setAnalysis] = useState<AnalysisResult | null>(parsedAnalysis);

    // Dirty State Detection
    const isDirty = useMemo(() => {
        const initialStack = initialData?.selected_stack || {};
        const initialNotes = initialData?.user_notes || '';
        // Simple JSON comparison for flat objects
        return JSON.stringify(stack) !== JSON.stringify(initialStack) || notes !== initialNotes;
    }, [stack, notes, initialData]);

    const handleSelect = (category: string, value: string) => {
        setStack(prev => {
            // Deselect logic: if clicking the current value, remove it.
            if (prev[category] === value) {
                const newStack = { ...prev };
                delete newStack[category];
                return newStack;
            }
            return { ...prev, [category]: value };
        });
        setShowForceProceed(false); // Reset on change
    };

    const handleSave = async (force = false) => {
        // Validation (Basic)
        if (!stack.frontend || !stack.backend) {
            setMessage({ type: 'error', text: 'Frontend and Backend are mandatory.' });
            return;
        }

        setSaving(true);
        setMessage(null);
        setShowForceProceed(false);

        try {
            const res = await fetch(`/api/projects/${projectId}/tech_choices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selected_stack: stack,
                    additional_notes: notes,
                    force_completion: force
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to analyze stack');
            }

            const result = await res.json();

            // Parse result
            let hasMandatoryInfo = false;
            if (result.data.generated_output) {
                try {
                    const cleanJson = result.data.generated_output.replace(/```json\n?|\n?```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    setAnalysis(parsed);
                    hasMandatoryInfo = parsed.suggestions?.some((s: any) => s.type === 'mandatory');
                } catch (e) {
                    console.error("Failed to parse analysis", e);
                }
            }

            if (result.data.refactored_version) {
                router.refresh();
            }

            if (hasMandatoryInfo && !force) {
                setMessage({ type: 'error', text: 'Critical issues found. Address mandatory items or proceed forcibly.' });
                setShowForceProceed(true);
            } else {
                setMessage({ type: 'success', text: 'Tech Stack saved successfully!' });
                // We don't hide inputs anymore, success message is enough
            }

        } catch (error: any) {
            console.error(error);
            const errorMsg = error.message === 'The AI model is currently overloaded. Please try again in a moment.'
                ? error.message
                : 'Failed to analyze stack. Please try again.';
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setSaving(false);
        }
    };

    const renderSection = (category: string, title: string, required = false, isDynamic = false) => {
        const relevantSuggestions = analysis?.suggestions?.filter(s => s.category.toLowerCase() === category.toLowerCase());
        const hasMandatoryFix = relevantSuggestions?.some(s => s.type === 'mandatory');

        return (
            <div key={category} className={`space-y-3 p-4 rounded-xl border transition-all ${hasMandatoryFix ? 'bg-red-900/10 border-red-500/50' : 'bg-neutral-900/30 border-transparent hover:border-neutral-800'}`}>
                <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                    {title}
                    {required && <span className="text-red-500 text-xs">*</span>}
                    {isDynamic && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full uppercase tracking-wider">New</span>}
                    {hasMandatoryFix && (
                        <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                            FIX REQUIRED
                        </span>
                    )}
                </label>

                <div className="space-y-3">
                    <input
                        type="text"
                        value={stack[category] || ''}
                        onChange={(e) => handleSelect(category, e.target.value)}
                        placeholder={`Select or type ${title}...`}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-900/50"
                    />
                    {/* Only show pills for known categories */}
                    {TECH_OPTIONS[category as keyof typeof TECH_OPTIONS] && (
                        <div className="flex flex-wrap gap-2">
                            {TECH_OPTIONS[category as keyof typeof TECH_OPTIONS].map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => handleSelect(category, opt)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${stack[category] === opt
                                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300'
                                        }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Inline Suggestions (Mandatory/Optional/Unnecessary) with Auto-Fill/Remove */}
                {relevantSuggestions && relevantSuggestions.length > 0 && (
                    <div className="space-y-2 mt-2 pt-2 border-t border-neutral-800">
                        {relevantSuggestions.map((s, idx) => (
                            <div key={idx} className="flex flex-col gap-2">
                                <div className={`text-xs flex gap-2 items-start ${s.type === 'mandatory' ? 'text-red-300' :
                                    s.type === 'unnecessary' ? 'text-neutral-400 line-through decoration-red-500' : 'text-amber-300'
                                    }`}>
                                    <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${s.type === 'mandatory' ? 'bg-red-500/20 text-red-500' :
                                        s.type === 'unnecessary' ? 'bg-neutral-800 text-neutral-500' : 'bg-amber-500/20 text-amber-500'
                                        }`}>
                                        {s.type}
                                    </span>
                                    <span className="flex-1">{s.text}</span>
                                </div>

                                {/* Action Button */}
                                {s.suggested_value && (
                                    <>
                                        {/* Auto-Fill (for mandatory/optional) */}
                                        {s.type !== 'unnecessary' && stack[category] !== s.suggested_value && (
                                            <button
                                                onClick={() => handleSelect(category, s.suggested_value!)}
                                                className="self-start ml-8 text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
                                                </svg>
                                                Add "{s.suggested_value}"
                                            </button>
                                        )}

                                        {/* Auto-Remove (for unnecessary) */}
                                        {s.type === 'unnecessary' && (
                                            <button
                                                onClick={() => handleSelect(category, '')}
                                                className="self-start ml-8 text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                                                </svg>
                                                Remove "{s.suggested_value}"
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Calculate dynamic categories from suggestions (exclude known ones)
    const baseCategories = new Set(Object.keys(TECH_OPTIONS));
    const suggestedCategories = analysis?.suggestions
        ? Array.from(new Set(analysis.suggestions.map(s => s.category).filter(c => !baseCategories.has(c.toLowerCase()) && c.toLowerCase() !== 'general')))
        : [];

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">Tech Stack</h2>
                    <p className="text-neutral-400">Select your technologies. We'll check if they fit your vision.</p>
                </div>
                {/* Edit Button Removed as per request */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Core Stack */}
                <div className="space-y-6">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-neutral-800 pb-2">Core Infrastructure</h3>
                    {renderSection('frontend', 'Frontend Framework', true)}
                    {renderSection('backend', 'Backend / API', true)}
                    {renderSection('database', 'Database')}
                </div>

                {/* Additional Stack */}
                <div className="space-y-6">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-neutral-800 pb-2">Enhancements & Ops</h3>
                    {renderSection('auth', 'Authentication')}
                    {renderSection('ai', 'AI Capabilities')}
                    {renderSection('hosting', 'Deployment / Hosting')}
                </div>
            </div>

            {/* Dynamic / Suggested Categories - Full Width to fix layout issues */}
            {suggestedCategories.length > 0 && (
                <div className="space-y-6 animate-in fade-in duration-700 bg-blue-900/5 rounded-xl p-6 border border-blue-900/20">
                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider border-b border-blue-900/30 pb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        AI Suggested Additions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {suggestedCategories.map(cat => renderSection(cat, cat.charAt(0).toUpperCase() + cat.slice(1), false, true))}
                    </div>
                </div>
            )}

            {/* Additional Notes Section */}
            <div className="space-y-3 px-1">
                <label className="text-sm font-bold text-white uppercase tracking-wider">Additional Requirements / Notes</label>
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="E.g., 'I prefer using Supabase over Firebase', 'Strictly open-source only', etc..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-900/50 min-h-[100px] resize-none placeholder:text-neutral-600 transition-all hover:border-neutral-700"
                />
            </div>

            {/* Analysis Result */}
            {analysis && (
                <div className="mt-12 space-y-6 border-t border-neutral-800 pt-8 animate-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full animate-pulse ${analysis.feasibility === 'high' ? 'bg-emerald-500' :
                            analysis.feasibility === 'medium' ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                        <h3 className="text-xl font-bold text-white">Feasibility Analysis: <span className="capitalize">{analysis.feasibility}</span></h3>
                    </div>

                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
                        <div className="prose prose-invert max-w-none text-sm text-neutral-300">
                            <ReactMarkdown>{analysis.analysis}</ReactMarkdown>
                        </div>
                    </div>

                    {/* Show GENERAL suggestions or ones without a specific category link if any */}
                    {analysis.suggestions.filter(s => s.category === 'general').length > 0 && (
                        <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4">
                            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">General Suggestions</h4>
                            <ul className="space-y-2">
                                {analysis.suggestions.filter(s => s.category === 'general').map((s, i) => (
                                    <li key={i} className="text-sm text-neutral-400 flex gap-2"><span className="text-blue-500">•</span> {s.text}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Actions: Show if dirty OR if forced proceed is needed */}
            {(isDirty || showForceProceed) && (
                <div className="pt-8 border-t border-neutral-900 flex flex-col gap-4 sticky bottom-0 bg-neutral-950/80 backdrop-blur-md p-4 -mx-4 rounded-xl border-t border-white/5 shadow-2xl z-20 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="text-sm flex justify-between items-center">
                        {message && (
                            <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                                {message.text}
                            </span>
                        )}
                        {!message && <span className="text-neutral-400 text-xs italic">Changes detected...</span>}
                    </div>

                    {showForceProceed ? (
                        <div className="flex justify-end gap-3 animate-in fade-in duration-300">
                            <button
                                onClick={() => handleSave(false)}
                                className="bg-neutral-800 text-neutral-300 px-6 py-3 rounded-xl font-medium hover:bg-neutral-700 transition-all"
                            >
                                Try to Fix
                            </button>
                            <button
                                onClick={() => handleSave(true)}
                                className="bg-red-600/20 text-red-500 border border-red-500/50 px-6 py-3 rounded-xl font-bold hover:bg-red-600/30 transition-all flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                                Proceed Anyway
                            </button>
                        </div>
                    ) : (
                        <div className="flex justify-end">
                            <button
                                onClick={() => handleSave(false)}
                                disabled={saving}
                                className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-white/5"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        Analyzing Stack...
                                    </>
                                ) : (
                                    'Save & Analyze Stack'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
