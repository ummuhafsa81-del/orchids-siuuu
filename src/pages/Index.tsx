import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Bot, Zap, Settings, TrendingUp } from "lucide-react";
import FeatureCard from "@/components/FeatureCard";
import { NovaLogoSvg } from "@/components/NovaLogoSvg";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-center px-6 pt-8 pb-6 max-w-6xl mx-auto">
        <NovaLogoSvg className="h-12 w-auto" />
      </header>

      {/* Hero Section */}
      <section className="px-6 py-8 max-w-4xl mx-auto text-center">
        <div className="space-y-8">
          <h2 className="text-4xl lg:text-5xl font-normal text-muted-foreground leading-tight">
            AI conversation, automated content, instant execution. Workflow is
            redefined now.
          </h2>

          <div className="mt-8 flex items-center justify-center gap-4">
            <Link to="/signup">
              <Button
                variant="nova"
                size="sm"
                className="px-8 py-4 rounded-full text-sm"
              >
                Try Now
              </Button>
            </Link>
            <Link to="/login">
              <Button
                variant="outline"
                size="sm"
                className="px-8 py-4 rounded-full text-sm"
              >
                Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-16 max-w-2xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6">
          <FeatureCard
            icon={Settings}
            title="Seamless Workflow Automation"
            description="Stop managing manual tasks. NOVA integrates with your existing tools to handle repetitive data entry, scheduling, and reporting—all running silently in the background."
          />
          <FeatureCard
            icon={TrendingUp}
            title="Scalable Business Optimization"
            description="Instantly identify bottlenecks and execute solutions. NOVA creates self-improving workflows that grow with your company, ensuring maximum efficiency without the headcount."
          />
          <FeatureCard
            icon={Bot}
            title="Intelligent Chat"
            description="Engage in natural, context-aware conversations with NOVA's advanced AI. Get instant answers, creative ideas, and thoughtful responses tailored to your needs."
          />
          <FeatureCard
            icon={Zap}
            title="Lightning Fast"
            description="Experience real-time AI processing that keeps up with your thoughts. No more waiting for answers—get instant results when you need them most."
          />
        </div>
      </section>
    </div>
  );
};

export default Index;
