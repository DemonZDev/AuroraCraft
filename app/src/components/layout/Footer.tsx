import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
    return (
        <footer className="bg-[#0a0a0f] border-t border-white/5 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-12">
                    {/* Brand */}
                    <div className="md:col-span-2">
                        <Link href="/" className="flex items-center gap-3 mb-4">
                            <Logo className="w-8 h-8" />
                            <span className="text-xl font-bold text-white">AuroraCraft</span>
                        </Link>
                        <p className="text-gray-400 mb-6 max-w-sm">
                            Build without limits. Create Minecraft plugins, mods, Discord
                            bots, and web apps with AI.
                        </p>
                        <div className="flex gap-4">
                            <a
                                href="https://discord.gg/auroracraft"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-10 h-10 bg-[#16161f] rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1c1c27] transition-all"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.565 18.565 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z" />
                                </svg>
                            </a>
                            <a
                                href="https://twitter.com/auroracraftai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-10 h-10 bg-[#16161f] rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1c1c27] transition-all"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            </a>
                            <a
                                href="https://github.com/auroracraft"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-10 h-10 bg-[#16161f] rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1c1c27] transition-all"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    {/* Links */}
                    <div>
                        <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                            Products
                        </h4>
                        <ul className="space-y-3">
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Minecraft Plugins
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Minecraft Mods
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Discord Bots
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Web Apps
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                            Resources
                        </h4>
                        <ul className="space-y-3">
                            <li>
                                <Link href="/docs" className="text-gray-400 hover:text-white transition-colors">
                                    Documentation
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    API Reference
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Blog
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Community
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                            Legal
                        </h4>
                        <ul className="space-y-3">
                            <li>
                                <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                                    Cookie Policy
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-gray-500 text-sm">
                        © {new Date().getFullYear()} AuroraCraft. All rights reserved.
                    </p>
                    <p className="text-gray-500 text-sm">
                        Made with <span className="text-pink-500">♥</span> for creators
                        worldwide
                    </p>
                </div>
            </div>
        </footer>
    );
}
