import { LandingNav } from "../components/landing/LandingNav";
import { LandingHero } from "../components/landing/LandingHero";
import { Statement, WorkflowShowcase } from "../components/landing/WorkflowShowcase";
import { FeatureCarousel } from "../components/landing/FeatureCarousel";
import { LifecycleBand, ProofSection } from "../components/landing/ProofSection";
import { PricingSection } from "../components/landing/PricingSection";
import { FaqSection } from "../components/landing/FaqSection";
import { FinalCta, LandingFooter } from "../components/landing/LandingFooter";

/**
 * Public marketing page (rendered at /home, and at / for logged-out visitors).
 * Ember Night design language: see docs/design/EMBER_NIGHT_DESIGN_LANGUAGE.md.
 */
export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-base text-ink antialiased">
      <a
        href="#main"
        className="sr-only z-[60] rounded-pill bg-ink px-4 py-2 text-base focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <LandingHero />
        <Statement />
        <WorkflowShowcase />
        <FeatureCarousel />
        <ProofSection />
        <LifecycleBand />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
