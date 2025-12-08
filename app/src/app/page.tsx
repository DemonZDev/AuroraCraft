"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { ShowcaseSection } from "@/components/home/ShowcaseSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { CTASection } from "@/components/home/CTASection";

export default function HomePage() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <Navbar />
        <main>
          <HeroSection />
          <FeaturesSection />
          <ShowcaseSection />
          <HowItWorksSection />
          <CTASection />
        </main>
        <Footer />
      </ProjectProvider>
    </AuthProvider>
  );
}
