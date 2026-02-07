'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface FeatureDef {
    key: string;
    name: string;
    enabled: boolean;
    status: string; // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
}

export default function ProjectSidebar({ projectId, features, activeTab }: { projectId: string, features: FeatureDef[], activeTab: string }) {
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/status`);
                if (res.ok) {
                    const data = await res.json();
                    setIsGenerating(data.isGenerating);
                }
            } catch (e) {
                console.error("Status Check Failed", e);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 10000); // Poll every 3s
        return () => clearInterval(interval);
    }, [projectId]);

    return (
        <div className="col-span-3 space-y-2 sticky top-24 h-fit">
            {features.map((feature, idx) => {
                const isActive = feature.key === activeTab;
                const isCompleted = feature.status === 'COMPLETED';
                const isInProgress = feature.status === 'IN_PROGRESS';

                // If generating, disable NAV unless it's the CURRENT TAB (so you can see progress)
                // Also disable if PENDING and not active (standard logic)
                const isLockedByGen = isGenerating && !isActive;
                const isAccessible = !isLockedByGen && (feature.status !== 'PENDING' || isActive);

                return (
                    <Link
                        key={feature.key}
                        href={isAccessible ? `/projects/${projectId}?tab=${feature.key}` : '#'}
                        onClick={(e) => { if (!isAccessible) e.preventDefault(); }}
                        className={`
                            block w-full text-left p-4 rounded-xl transition-all border select-none
                            ${isActive
                                ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                                : isAccessible
                                    ? isInProgress
                                        ? 'bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10'
                                        : 'bg-neutral-900/30 border-transparent hover:bg-neutral-800 hover:text-white text-neutral-400'
                                    : 'bg-transparent border-transparent text-neutral-700 cursor-not-allowed opacity-50'
                            }
                        `}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold flex items-center gap-2">
                                {idx + 1}. {feature.name}
                                {isLockedByGen && (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-neutral-600">
                                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </span>
                            {isCompleted ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                </svg>
                            ) : isInProgress && !isActive && (
                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            )}
                        </div>
                        <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500 w-full' :
                                    isActive ? 'bg-blue-500 w-1/2' :
                                        isInProgress ? 'bg-amber-500 w-1/2' : 'w-0'
                                    }`}
                            />
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
