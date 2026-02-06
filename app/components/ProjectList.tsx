'use client';

import Link from 'next/link';

import { useState, useEffect } from 'react';

interface Project {
    _id: string;
    name: string;
    status: string;
    mode_name: string;
    updatedAt: string;
}

interface Mode {
    id: string;
    name: string;
}

export default function ProjectList() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [creating, setCreating] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [modes, setModes] = useState<Mode[]>([]);
    const [selectedMode, setSelectedMode] = useState<string>('');

    useEffect(() => {
        fetchProjects(page);
        fetchModes();
    }, [page]);

    const fetchModes = async () => {
        try {
            const res = await fetch('/api/modes');
            if (res.ok) {
                const data = await res.json();
                setModes(data.modes);
                // Default to first mode if available
                if (data.modes.length > 0) {
                    setSelectedMode(data.modes[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to fetch modes', error);
        }
    };

    const fetchProjects = async (pageNum: number) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects?page=${pageNum}&limit=5`); // Limit 5 for demo to show pagination easily
            if (res.ok) {
                const data = await res.json();
                setProjects(data.projects);
                setTotalPages(data.pagination.totalPages);
            }
        } catch (error) {
            console.error('Failed to fetch projects', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        setCreating(true);
        try {
            if (!selectedMode) {
                console.error("No mode selected");
                return;
            }

            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProjectName,
                    mode_id: selectedMode
                }),
            });

            if (res.ok) {
                setNewProjectName('');
                setIsCreateModalOpen(false);
                setPage(1); // Reset to first page
                fetchProjects(1); // Refresh list
            }
        } catch (error) {
            console.error('Failed to create project', error);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        e.preventDefault(); // Prevent link navigation if inside link (though we put link around div content usually, or click handler on div)
        if (!confirm('Are you sure you want to delete this project?')) return;

        try {
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            if (res.ok) {
                // If deleting last item on page, go back one page if possible
                if (projects.length === 1 && page > 1) {
                    setPage(p => p - 1);
                } else {
                    fetchProjects(page);
                }
            }
        } catch (error) {
            console.error('Failed to delete project', error);
        }
    };

    if (loading) return (
        <div className="w-full max-w-2xl space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-neutral-900/50 animate-pulse rounded-xl"></div>)}
        </div>
    );

    return (
        <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-neutral-200 tracking-tight">Projects</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="text-sm bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-neutral-200 transition-colors"
                >
                    New Project
                </button>
            </div>

            {/* List */}
            <div className="space-y-3">
                {projects.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-neutral-800 rounded-xl">
                        <p className="text-neutral-500">No projects found. Create one to get started.</p>
                    </div>
                )}

                {projects.map((project) => (
                    <div key={project._id} className="relative group">
                        <Link href={`/projects/${project._id}`} className="block">
                            <div
                                className="flex items-center justify-between p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 font-medium group-hover:text-white group-hover:bg-neutral-700 transition-colors">
                                        {project.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="text-neutral-200 font-medium group-hover:text-white transition-colors">{project.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] uppercase tracking-wide text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                                                {project.mode_name || 'MODE'}
                                            </span>
                                            <p className="text-xs text-neutral-500">
                                                {new Date(project.updatedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Status and Actions */}
                                <div className="flex items-center gap-3">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${project.status === 'Active' ? 'bg-emerald-950/30 text-emerald-500 border-emerald-900/50' :
                                        project.status === 'Building' ? 'bg-blue-950/30 text-blue-500 border-blue-900/50' :
                                            'bg-neutral-800 text-neutral-500 border-neutral-700'
                                        }`}>
                                        {project.status || 'Active'}
                                    </span>
                                    <button
                                        onClick={(e) => handleDeleteProject(project._id, e)}
                                        className="z-10 p-2 text-neutral-600 hover:text-red-500 hover:bg-red-950/10 rounded-lg transition-colors relative"
                                        title="Delete Project"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </Link>
                    </div>
                ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-8">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="text-sm text-neutral-500 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-500 transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-xs text-neutral-600">Page {page} of {totalPages}</span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="text-sm text-neutral-500 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-500 transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">Create New Project</h3>
                        <form onSubmit={handleCreateProject}>
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-neutral-400 mb-1">Project Name</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-neutral-600 transition-colors"
                                    placeholder="e.g., My Awesome App"
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-xs font-medium text-neutral-400 mb-1">Select Mode</label>
                                <div className="relative">
                                    <select
                                        value={selectedMode}
                                        onChange={(e) => setSelectedMode(e.target.value)}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white appearance-none focus:outline-none focus:border-neutral-600 transition-colors"
                                    >
                                        {modes.map(mode => (
                                            <option key={mode.id} value={mode.id}>{mode.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="text-sm text-neutral-400 hover:text-white px-3 py-2 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !newProjectName.trim()}
                                    className="text-sm bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
                                >
                                    {creating ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
