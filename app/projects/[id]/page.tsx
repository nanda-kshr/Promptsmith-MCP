import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifyToken } from '@/app/lib/jwt';
import { getDb } from '@/app/lib/mongo';
import { ObjectId } from 'mongodb';
import Link from 'next/link';
import LogoutButton from '../../components/LogoutButton';
import VisionTab from '@/app/components/features/VisionTab';
import UserFlowTab from '@/app/components/features/UserFlowTab';
import TechChoicesTab from '@/app/components/features/TechChoicesTab';
import RulesTab from '@/app/components/features/RulesTab';
import DataModelsTab from '@/app/components/features/DataModelsTab';
import ApisTab from '@/app/components/features/ApisTab';
import ExecuteCodingTab from '@/app/components/features/ExecuteCodingTab';

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

    // 4. Get Features Data
    const visionFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'vision'
    });

    const userFlowFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'user_flow'
    });

    const techChoicesFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'tech_choices'
    });

    const rulesFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'rules'
    });

    const dataModelsFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'data_models'
    });

    const apisFeature = await db.collection('project_features').findOne({
        project_id: project._id,
        feature_key: 'apis'
    });

    return {
        project,
        mode,
        projectMode,
        visionData: visionFeature ? {
            ...visionFeature.user_input,
            generated_output: visionFeature.generated_output,
            refactored_version: visionFeature.refactored_version
        } : undefined,
        userFlowData: userFlowFeature ? {
            ...userFlowFeature.user_input,
            generated_output: userFlowFeature.generated_output
        } : undefined,
        techChoicesData: techChoicesFeature ? {
            selected_stack: techChoicesFeature.user_input?.selected_stack,
            user_notes: techChoicesFeature.user_input?.user_notes,
            generated_output: techChoicesFeature.generated_output
        } : undefined,
        rulesData: rulesFeature ? {
            generated_output: rulesFeature.generated_output,
            current_rules: rulesFeature.user_input?.current_rules,
            ignored_rules: rulesFeature.user_input?.ignored_rules,
            user_custom_input: rulesFeature.user_input?.user_custom_input
        } : undefined,
        dataModelsData: dataModelsFeature ? {
            generated_output: dataModelsFeature.generated_output,
            user_custom_input: dataModelsFeature.user_input?.user_custom_input
        } : undefined,
        apisData: apisFeature ? {
            generated_output: apisFeature.generated_output,
            user_custom_input: apisFeature.user_input?.user_custom_input
        } : undefined
    };
}

export default async function ProjectDetailsPage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ tab?: string }> }) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const data = await getProject(params.id);

    if (!data) {
        notFound();
    }

    const { project, mode, projectMode, visionData, userFlowData, techChoicesData, rulesData, dataModelsData, apisData } = data;

    // Default to first feature or 'vision'
    const activeTab = searchParams.tab || 'vision';

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

    const activeFeatureIndex = features.findIndex(f => f.key === activeTab);
    const nextFeature = features[activeFeatureIndex + 1];

    return (
        <main className="min-h-screen bg-black text-white selection:bg-blue-500/30">
            {/* Header / Navbar */}
            <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-neutral-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                            </svg>
                        </Link>
                        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">
                            {project.name}
                        </h1>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-[10px] font-medium text-neutral-400 uppercase tracking-wider border border-neutral-700">
                            {mode?.name || 'Expert Mode'}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Status Indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-full border border-neutral-800">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs text-neutral-400 font-medium">Auto-Saving</span>
                        </div>

                        {/* Top Next Button - Standardized Style */}
                        {nextFeature && nextFeature.status !== 'PENDING' && (
                            <Link
                                href={`/projects/${project._id}?tab=${nextFeature.key}`}
                                className="group flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                            >
                                <span className="text-xs font-semibold">Next: {nextFeature.name}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                </svg>
                            </Link>
                        )}

                        <LogoutButton />
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-12 gap-8">
                    {/* Sidebar Navigation */}
                    <div className="col-span-3 space-y-2 sticky top-24 h-fit">
                        {features.map((feature, idx) => {
                            const isActive = feature.key === activeTab;
                            const isCompleted = feature.status === 'COMPLETED';
                            const isInProgress = projectMode?.features?.[feature.key]?.status === 'IN_PROGRESS';
                            const isAccessible = feature.status !== 'PENDING' || isActive;

                            return (
                                <Link
                                    key={feature.key}
                                    href={isAccessible ? `/projects/${project._id}?tab=${feature.key}` : '#'}
                                    className={`
                                        block w-full text-left p-4 rounded-xl transition-all border
                                        ${isActive
                                            ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                                            : isAccessible
                                                ? isInProgress
                                                    ? 'bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10'
                                                    : 'bg-neutral-900/30 border-transparent hover:bg-neutral-800 hover:text-white text-neutral-400'
                                                : 'bg-transparent border-transparent text-neutral-600 cursor-not-allowed'
                                        }
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-bold">{idx + 1}. {feature.name}</span>
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

                    {/* Main Content Area */}
                    <div className="col-span-9 space-y-8">
                        {/* Dynamic Render of Active Feature */}
                        <div className="min-h-[500px]">
                            {activeTab === 'vision' && (
                                <VisionTab projectId={project._id.toString()} initialData={visionData} />
                            )}
                            {activeTab === 'user_flow' && (
                                <UserFlowTab projectId={project._id.toString()} initialData={userFlowData} />
                            )}
                            {activeTab === 'tech_choices' && (
                                <TechChoicesTab projectId={project._id.toString()} initialData={techChoicesData} />
                            )}
                            {activeTab === 'rules' && (
                                <RulesTab projectId={project._id.toString()} initialData={rulesData} />
                            )}
                            {activeTab === 'data_models' && (
                                <DataModelsTab projectId={project._id.toString()} initialData={dataModelsData} />
                            )}
                            {activeTab === 'apis' && (
                                <ApisTab projectId={project._id.toString()} initialData={apisData} />
                            )}
                            {activeTab === 'execute_coding' && (
                                <ExecuteCodingTab projectId={project._id.toString()} initialData={{}} /> // Todo: pass real data
                            )}
                            {activeTab !== 'vision' && activeTab !== 'user_flow' && activeTab !== 'tech_choices' && activeTab !== 'rules' && activeTab !== 'data_models' && activeTab !== 'apis' && activeTab !== 'execute_coding' && (
                                <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
                                    <div className="p-4 bg-neutral-800 rounded-full">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-neutral-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-xl font-medium text-white">Feature In Development</h3>
                                    <p className="text-neutral-400 max-w-md">The <strong>{features.find(f => f.key === activeTab)?.name}</strong> feature is ready to be implemented. Configure this module to proceed.</p>
                                </div>
                            )}
                        </div>

                        {/* Bottom Next Navigation (Only show if next feature exists and is accessible) */}
                        {nextFeature && nextFeature.status !== 'PENDING' && (
                            <div className="flex justify-end animate-in slide-in-from-bottom-4 fade-in duration-500">
                                <Link
                                    href={`/projects/${project._id}?tab=${nextFeature.key}`}
                                    className="group flex items-center gap-3 pl-6 pr-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                                >
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-blue-200 uppercase font-medium tracking-wide">Next Step</span>
                                        <span className="text-sm font-semibold">{nextFeature.name}</span>
                                    </div>
                                    <div className="p-2 bg-blue-500 rounded-lg group-hover:bg-blue-400 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
