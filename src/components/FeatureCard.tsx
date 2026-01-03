import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FeatureCard = ({ icon: Icon, title, description }: FeatureCardProps) => {
  return (
    <Card className="border-border shadow-md hover:shadow-lg transition-all duration-300 group">
      <CardContent className="p-6 space-y-4">
        <div className="w-12 h-12 bg-gradient-to-br from-pink-500/10 to-orange-400/10 rounded-lg flex items-center justify-center group-hover:from-pink-500/20 group-hover:to-orange-400/20 transition-colors">
          <Icon size={24} className="text-pink-500" />
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-lg text-foreground">{title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        </div>

        <Link to="/signup">
          <Button
            variant="ghost"
            size="sm"
            className="text-pink-500 hover:text-orange-400 hover:bg-pink-500/5 p-0 h-auto font-medium transition-colors group/btn"
          >
            Try Now
            <ArrowRight
              size={14}
              className="ml-1 group-hover/btn:translate-x-0.5 transition-transform"
            />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

export default FeatureCard;
