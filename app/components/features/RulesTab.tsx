'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RulesData {
    data_rules: string[];
    access_rules: string[];
    behavior_rules: string[];
    system_constraints: string[];
}

interface RulesTabProps {
    projectId: string;
    initialData?: {
        generated_output?: string;
        current_rules?: RulesData;
        ignored_rules?: RulesData;
        user_custom_input?: string;
    };
}

const CATEGORY_LABELS: Record<string, string> = {
    data_rules: 'Data Rules',
    access_rules: 'Access Rules',
    behavior_rules: 'Behavior Rules',
    system_constraints: 'System Constraints'
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    data_rules: 'DB Schema, Data Integrity, Formatting',
    access_rules: 'Auth, RBAC, Permissions',
    behavior_rules: 'Business Logic, Workflows',
    system_constraints: 'Tech Stack Limits, Performance, Security'
};

export default function RulesTab({ projectId, initialData }: RulesTabProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [customInput, setCustomInput] = useState(initialData?.user_custom_input || '');

    // Parse Initial Data
    const initialRules: RulesData | null = (() => {
        if (!initialData?.generated_output) return null;
        try {
            const cleanJson = initialData.generated_output.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            return parsed.rules || parsed;
        } catch (e) {
            console.error("Failed to parse initial rules", e);
            return null;
        }
    })();

    const [activeRules, setActiveRules] = useState<RulesData>(initialRules || {
        data_rules: [], access_rules: [], behavior_rules: [], system_constraints: []
    });

    const [ignoredRules, setIgnoredRules] = useState<RulesData>(initialData?.ignored_rules || {
        data_rules: [], access_rules: [], behavior_rules: [], system_constraints: []
    });

    const toggleRule = (category: keyof RulesData, rule: string, isRemoving: boolean) => {
        if (isRemoving) {
            setActiveRules(prev => ({
                ...prev,
                [category]: prev[category].filter(r => r !== rule)
            }));
            setIgnoredRules(prev => ({
                ...prev,
                [category]: [...(prev[category] || []), rule]
            }));
        } else {
            setIgnoredRules(prev => ({
                ...prev,
                [category]: prev[category].filter(r => r !== rule)
            }));
            setActiveRules(prev => ({
                ...prev,
                [category]: [...(prev[category] || []), rule]
            }));
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_rules: activeRules,
                    ignored_rules: ignoredRules,
                    user_custom_input: customInput
                })
            });

            if (!res.ok) throw new Error('Failed to generate rules');

            const result = await res.json();
            if (result.data?.generated_output) {
                try {
                    const cleanJson = result.data.generated_output.replace(/```json\n?|\n?```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    const newRules = parsed.rules || parsed;
                    setActiveRules(newRules);
                } catch (e) {
                    console.error("Failed to parse new rules", e);
                }
            }
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Failed to generate rules. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const hasRules = Object.values(activeRules).some(arr => arr?.length > 0);

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">System Rules & Constraints</h2>
                <p className="text-neutral-400">Review the AI-generated rules. Remove any that don't fit.</p>
            </div>

            {hasRules ? (
                <div className="space-y-8">
                    {(Object.keys(CATEGORY_LABELS) as Array<keyof RulesData>).map(category => {
                        const rules = activeRules[category] || [];
                        const ignored = ignoredRules[category] || [];
                        // Show active rules first

                        if (rules.length === 0 && ignored.length === 0) return null;

                        return (
                            <div key={category} className="space-y-3">
                                <div className="flex items-baseline gap-3 border-b border-neutral-800 pb-2">
                                    <h3 className="text-lg font-bold text-blue-400">{CATEGORY_LABELS[category]}</h3>
                                    <span className="text-xs text-neutral-500">{CATEGORY_DESCRIPTIONS[category]}</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Active Rules */}
                                    {rules.map((rule, idx) => (
                                        <div key={`active-${idx}`} className="group flex items-start justify-between gap-3 bg-neutral-900 border border-neutral-800 p-3 rounded-lg hover:border-neutral-600 transition-all shadow-sm">
                                            <span className="text-sm text-neutral-200 leading-relaxed">{rule}</span>
                                            <button
                                                onClick={() => toggleRule(category, rule, true)}
                                                className="shrink-0 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded transition-colors"
                                                title="Remove this rule"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}

                                    {/* Ignored Rules (Collapsed/faded) */}
                                    {ignored.map((rule, idx) => (
                                        <div key={`ignored-${idx}`} className="flex items-center justify-between gap-3 bg-neutral-900/30 border border-neutral-800/50 p-2 rounded-lg opacity-60 hover:opacity-100 transition-all">
                                            <span className="text-sm text-neutral-500 line-through decoration-neutral-700">{rule}</span>
                                            <button
                                                onClick={() => toggleRule(category, rule, false)}
                                                className="shrink-0 text-neutral-600 hover:text-emerald-500 hover:bg-emerald-500/10 p-1.5 rounded transition-colors"
                                                title="Restore this rule"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 011.025-.275l6 3.5a.75.75 0 010 1.286l-6 3.5a.75.75 0 01-1.125-.65V6.5A4.5 4.5 0 003 11v.25a.75.75 0 01-1.5 0V11a6 6 0 016-6v-2.75a.75.75 0 01.293-.668zM6.5 7.5a6 6 0 00-6 6v.25a.75.75 0 001.5 0V13.5a4.5 4.5 0 014.5-4.5v1.25a.75.75 0 001.125.65l6-3.5a.75.75 0 000-1.286l-6-3.5A.75.75 0 006.5 3.168V7.5z" clipRule="evenodd" transform="translate(0, 2)" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
                    <p className="text-neutral-500">No rules generated yet.</p>
                </div>
            )}

            {/* User Input Section */}
            <div className="space-y-4 pt-6 border-t border-neutral-800">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    Custom Rules / Input
                </h3>
                <p className="text-xs text-neutral-400">
                    Add specific business logic or technical constraints here. Be detailed.
                </p>
                <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="E.g. 'Users cannot delete projects that have active deployments', 'All API responses must be JSON'"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-900/50 min-h-[120px] resize-none placeholder:text-neutral-600"
                />
            </div>

            {/* Action Bar */}
            <div className="flex justify-end pt-4 sticky bottom-4 z-20">
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-white/5"
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Thinking...
                        </>
                    ) : (
                        hasRules ? 'Save & Regenerate' : 'Generate System Rules'
                    )}
                </button>
            </div>
        </div>
    );
}
