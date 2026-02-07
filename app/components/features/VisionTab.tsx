'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRouter } from 'next/navigation';

interface VisionData {
    purpose: string;
    problem_statement: string;
}

interface VisionTabProps {
    projectId: string;
    initialData?: VisionData;
}

export default function VisionTab({ projectId, initialData }: VisionTabProps) {
    const router = useRouter();
    const [formData, setFormData] = useState<VisionData & { generated_output?: string }>({
        purpose: initialData?.purpose || '',
        problem_statement: initialData?.problem_statement || '',
        generated_output: (initialData as any)?.generated_output || ''
    });

    // Edit mode: Default to true if no generated output, so user can type immediately
    const [isEditing, setIsEditing] = useState(!(initialData as any)?.generated_output);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Track last saved state to determine if dirty
    const [lastSaved, setLastSaved] = useState({
        purpose: initialData?.purpose || '',
        problem_statement: initialData?.problem_statement || ''
    });

    const isDirty = formData.purpose.trim() !== lastSaved.purpose.trim() ||
        formData.problem_statement.trim() !== lastSaved.problem_statement.trim();

    const isValid = formData.purpose.trim().length > 0 && formData.problem_statement.trim().length > 0;

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
        const normalizedData = {
            purpose: formData.purpose.trim().replace(/\s+/g, ' '),
            problem_statement: formData.problem_statement.trim().replace(/\s+/g, ' ')
        };

        // Update form with normalized values locally too
        setFormData(prev => ({ ...prev, ...normalizedData, generated_output: '' }));

        try {
            const res = await fetch(`/api/projects/${projectId}/vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizedData)
            });

            if (!res.ok) throw new Error('Failed to save vision');

            const result = await res.json();
            if (result.data) {
                setFormData(prev => ({
                    ...prev,
                    ...result.data
                }));
                // Update last saved to match new successful state
                setLastSaved({
                    purpose: result.data.purpose,
                    problem_statement: result.data.problem_statement
                });

                // 4. Update frontend version (Sidebar)
                if (result.data.refactored_version) {
                    router.refresh();
                }
            }

            setMessage({ type: 'success', text: 'Vision generated & version updated!' });

            // 2. Once saved/generated, user can only edit again. Turn off edit mode.
            setIsEditing(false);

            setTimeout(() => setMessage(null), 3000);

        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: 'Failed to save changes' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">Project Vision</h2>
                    <p className="text-neutral-400">Define the core purpose and problem you are solving.</p>
                </div>
                {/* Only show Edit button if NOT editing AND we have output (otherwise inputs are just open) */}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Purpose Section */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-300">Purpose</label>
                    <textarea
                        name="purpose"
                        value={formData.purpose}
                        onChange={handleChange}
                        disabled={!isEditing || saving}
                        rows={6}
                        className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-900/50 focus:border-blue-800 transition-all resize-none ${(!isEditing || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="e.g., To create a seamless platform..."
                    />
                </div>

                {/* Problem Statement Section */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-300">Problem Statement</label>
                    <textarea
                        name="problem_statement"
                        value={formData.problem_statement}
                        onChange={handleChange}
                        disabled={!isEditing || saving}
                        rows={6}
                        className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-900/50 focus:border-blue-800 transition-all resize-none ${(!isEditing || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="e.g., Developers currently struggle..."
                    />
                </div>
            </div>

            {/* Generated Vision Display */}
            {/* Show generated output if it exists */}
            {(formData as any).generated_output && (
                <div className="space-y-4 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <label className="block text-lg font-semibold text-emerald-400">
                            Refined Vision
                        </label>
                        <span className="text-xs text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded-full border border-neutral-800">AI Generated</span>
                    </div>

                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-1000"></div>
                        <div className="relative bg-black/80 backdrop-blur-xl border border-neutral-800 rounded-xl p-8 prose prose-invert max-w-none text-base leading-relaxed text-neutral-200 shadow-2xl">
                            <ReactMarkdown>{(formData as any).generated_output}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading / Generating State Display when output is cleared during save */}
            {saving && !(formData as any).generated_output && (
                <div className="pt-6 border-t border-neutral-800 text-center py-8 animate-pulse">
                    <span className="text-emerald-400 text-sm">Generating new vision...</span>
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
        </div >
    );
}
