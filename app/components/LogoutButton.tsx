'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/signin');
            router.refresh(); // Refresh to ensure valid cookies are cleared from client state view
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    return (
        <button
            onClick={handleLogout}
            className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
        >
            Logout
        </button>
    );
}
