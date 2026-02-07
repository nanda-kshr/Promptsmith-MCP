import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProjectList from './components/ProjectList';
import AuthTokenCard from './components/AuthTokenCard';
import GeminiKeyCard from './components/GeminiKeyCard';
import LogoutButton from './components/LogoutButton';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');

  if (!token) {
    redirect('/signin');
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200">
      {/* Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-lg">P</span>
            </div>
            <span className="font-semibold text-white tracking-tight">PromptSmith</span>
          </div>
          <div className="flex items-center gap-4">
            <LogoutButton />
            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700"></div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main Content (Center - Project List) */}
          <div className="lg:col-span-2">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
              <p className="text-neutral-500">Welcome back to your workspace.</p>
            </div>
            <ProjectList />
          </div>

          {/* Sidebar (Right - Auth Token & Gemini Key) */}
          <div className="lg:col-span-1 space-y-6">
            <AuthTokenCard />
            <GeminiKeyCard />
          </div>
        </div>
      </div>
    </main>
  );
}
