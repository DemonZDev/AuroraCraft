import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import '@/styles/globals.css';

export const metadata: Metadata = {
    title: 'AuroraCraft - AI-Powered Minecraft Plugin Builder',
    description: 'Create astounding Minecraft plugins with no coding knowledge required. Powered by advanced AI.',
    keywords: ['minecraft', 'plugin', 'ai', 'generator', 'spigot', 'paper', 'bukkit'],
    authors: [{ name: 'AuroraCraft' }],
    openGraph: {
        title: 'AuroraCraft - AI-Powered Minecraft Plugin Builder',
        description: 'Create astounding Minecraft plugins with no coding knowledge required.',
        type: 'website',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className="min-h-screen bg-dark-950">
                {children}
                <Toaster
                    position="bottom-right"
                    toastOptions={{
                        style: {
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                        },
                        success: {
                            iconTheme: {
                                primary: '#10b981',
                                secondary: '#f8fafc',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#ef4444',
                                secondary: '#f8fafc',
                            },
                        },
                    }}
                />
            </body>
        </html>
    );
}
