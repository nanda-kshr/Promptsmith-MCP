import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifyToken } from '@/app/lib/jwt';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';
import Link from 'next/link';
import LogoutButton from '../../components/LogoutButton';
import VisionTab from '@/app/components/features/VisionTab';

async function getProject(id: string) {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload || typeof payload === 'string' || !payload.userId) return null;

    if (!ObjectId.isValid(id)) return null;

    const db = await getDb();

    // 1. Get Project
    const project = await db.collection('projects').findOne({
        _id: new ObjectId(id),
        createdBy: new ObjectId(payload.userId)
    });

    if (!project) return null;

    // 2. Get Mode (Static Info: Name, Method, Enabled)
    const mode = await db.collection('modes').findOne({ _id: project.mode_id });

    const projectMode = await db.collection('project_modes').findOne({
        project_id: project._id
    });

    // 4. Get Vision Feature Data
    const visionFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'vision'
    });

    return { project, mode, projectMode, visionData: visionFeature?.user_input };
}

export default async function ProjectDetailsPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const data = await getProject(params.id);

    if (!data) {
        notFound();
    }

    const { project, mode, projectMode, visionData } = data;

    // Combine static mode features with dynamic project mode status
    const features = mode?.features ? Object.entries(mode.features).map(([key, staticFeature]: [string, any]) => {
        const dynamicStatus = projectMode?.features?.[key]?.status || 'PENDING';
        return {
            key,
            name: staticFeature.name,
            enabled: staticFeature.enabled,
            status: dynamicStatus
        };
    }) : [];

    return (
        <main className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col">
            {/* Header */}
            <header className="border-b border-neutral-900 bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                            </svg>
                        </Link>
                        <div className="h-6 w-px bg-neutral-800"></div>
                        <div className="flex flex-col">
                            <h1 className="text-sm font-semibold text-white leading-tight">{project.name}</h1>
                            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{mode?.name} MODE</span>
                        </div>
                    </div>

                    {/* Feature Tabs (Scrollable) */}
                    <div className="flex-1 mx-8 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-1">
                            {features.map((feature) => {
                                const isActive = feature.status === 'IN_PROGRESS' || feature.status === 'COMPLETED';
                                const isDisabled = feature.status === 'PENDING';

                                return (
                                    <button
                                        key={feature.key}
                                        disabled={isDisabled}
                                        className={`
                                            px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border
                                            ${isActive
                                                ? 'bg-neutral-800 text-white border-neutral-700'
                                                : isDisabled
                                                    ? 'text-neutral-700 border-transparent cursor-not-allowed'
                                                    : 'text-neutral-500 hover:text-white hover:bg-neutral-800 border-transparent'
                                            }
                                        `}
                                    >
                                        {feature.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <LogoutButton />
                        <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700"></div>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-full">
                    {/* Sidebar / Info */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
                            <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-4">Project Status</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-neutral-400">Status</span>
                                    <span className="text-sm text-white">{project.status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-neutral-400">Created</span>
                                    <span className="text-sm text-white">{new Date(project.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-neutral-400">Version</span>
                                    <span className="text-sm text-white">v{project.refactored_version}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feature Content */}
                    <div className="lg:col-span-3">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 min-h-[500px]">
                            {/* For now, just render VisionTab if we have data or if it's the active tab. 
                                In a real app we'd switch based on state/url.
                                For this MVP, we assume Vision is the primary/default edit view.
                            */}
                            <VisionTab projectId={project._id.toString()} initialData={visionData} />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
